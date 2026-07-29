import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitMqConsumer } from './rabbitmq.consumer';
import { ORDER_STATUS_CHANGED_QUEUE } from './rabbitmq.publisher';
import { EmailService } from './email.service';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { OrderStatus } from '../order/order-status.enum';

jest.mock('amqplib');

function buildEvent(): OrderStatusChangedEvent {
  return {
    orderId: 'order-1',
    customerName: 'Alice',
    customerEmail: 'alice@example.com',
    oldStatus: OrderStatus.OPEN,
    newStatus: OrderStatus.CONFIRMED,
    totalAmount: '20.00',
    changedAt: new Date(),
  };
}

function buildConfigService(): ConfigService {
  return { get: () => ({ url: 'amqp://guest:guest@localhost:5672' }) } as unknown as ConfigService;
}

function buildChannel() {
  return {
    assertQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function buildConnection(channel: ReturnType<typeof buildChannel>) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function buildMessage(event: OrderStatusChangedEvent): amqp.ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(event)) } as unknown as amqp.ConsumeMessage;
}

async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('RabbitMqConsumer', () => {
  let emailService: { sendOrderStatusEmail: jest.Mock };
  let consumer: RabbitMqConsumer;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = { sendOrderStatusEmail: jest.fn().mockResolvedValue(undefined) };
    consumer = new RabbitMqConsumer(buildConfigService(), emailService as unknown as EmailService);
  });

  afterEach(async () => {
    await consumer.onModuleDestroy();
    jest.useRealTimers();
  });

  it('asserts the queue, sets prefetch, and starts consuming on module init', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    consumer.onModuleInit();
    await flush();

    expect(channel.assertQueue).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_QUEUE, { durable: true });
    expect(channel.prefetch).toHaveBeenCalledWith(10);
    expect(channel.consume).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_QUEUE, expect.any(Function));
  });

  it('acks the message after successfully sending the email', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    consumer.onModuleInit();
    await flush();

    const consumeCallback = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
    const event = buildEvent();
    consumeCallback(buildMessage(event));
    await flush();

    expect(emailService.sendOrderStatusEmail).toHaveBeenCalledWith({ ...event, changedAt: event.changedAt.toISOString() });
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('nacks with requeue when sending the email fails', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    emailService.sendOrderStatusEmail.mockRejectedValue(new Error('SMTP down'));

    consumer.onModuleInit();
    await flush();

    const consumeCallback = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
    const message = buildMessage(buildEvent());
    consumeCallback(message);
    await flush();

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('retries the connection after a failed connect attempt', async () => {
    jest.useFakeTimers();
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(connection);

    consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(5_000);
    await jest.advanceTimersByTimeAsync(0);

    expect(amqp.connect).toHaveBeenCalledTimes(2);
    expect(channel.consume).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_QUEUE, expect.any(Function));
  });

  it('stops retrying once the module is destroyed', async () => {
    jest.useFakeTimers();
    (amqp.connect as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    await consumer.onModuleDestroy();
    const callsBeforeAdvancing = (amqp.connect as jest.Mock).mock.calls.length;

    await jest.advanceTimersByTimeAsync(20_000);

    expect(amqp.connect).toHaveBeenCalledTimes(callsBeforeAdvancing);
  });
});
