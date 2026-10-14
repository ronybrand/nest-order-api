import { PermanentEmailError } from './email.service';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitMqConsumer } from './rabbitmq.consumer';
import {
  MAX_RETRIES,
  ORDER_STATUS_CHANGED_DLQ,
  ORDER_STATUS_CHANGED_QUEUE,
  QUEUE_ARGUMENTS,
} from './rabbitmq.constants';
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
    sendToQueue: jest.fn(),
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

function buildMessage(
  event: OrderStatusChangedEvent,
  headers: Record<string, unknown> = {},
  messageId?: string,
): amqp.ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(event)),
    properties: { headers, messageId },
  } as unknown as amqp.ConsumeMessage;
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

    expect(channel.assertQueue).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_DLQ, { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_QUEUE, {
      durable: true,
      arguments: QUEUE_ARGUMENTS,
    });
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

  it('republishes with an incremented retry header and acks the original when sending the email fails', async () => {
    jest.useFakeTimers();
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    emailService.sendOrderStatusEmail.mockRejectedValue(new Error('SMTP down'));

    consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    const consumeCallback = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
    const event = buildEvent();
    const message = buildMessage(event, { 'x-retry-count': 1 });
    consumeCallback(message);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      ORDER_STATUS_CHANGED_QUEUE,
      message.content,
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
        headers: { 'x-retry-count': 2 },
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('sends the message to the DLQ once the retry limit is exceeded', async () => {
    jest.useFakeTimers();
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
    emailService.sendOrderStatusEmail.mockRejectedValue(new Error('SMTP down'));

    consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    const consumeCallback = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
    const message = buildMessage(buildEvent(), { 'x-retry-count': MAX_RETRIES });
    consumeCallback(message);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('sends a malformed message straight to the DLQ without retrying', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    consumer.onModuleInit();
    await flush();

    const consumeCallback = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
    const message = { content: Buffer.from('not-json'), properties: { headers: {} } } as unknown as amqp.ConsumeMessage;
    consumeCallback(message);
    await flush();

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(emailService.sendOrderStatusEmail).not.toHaveBeenCalled();
  });

  it('sends an event missing required fields straight to the DLQ without retrying', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    consumer.onModuleInit();
    await flush();

    const consumeCallback = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
    const invalidPayload = { orderId: 'order-1' };
    const message = {
      content: Buffer.from(JSON.stringify(invalidPayload)),
      properties: { headers: {} },
    } as unknown as amqp.ConsumeMessage;
    consumeCallback(message);
    await flush();

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(emailService.sendOrderStatusEmail).not.toHaveBeenCalled();
  });

  it('reconnects when the connection is closed unexpectedly', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    consumer.onModuleInit();
    await flush();
    expect(amqp.connect).toHaveBeenCalledTimes(1);

    (connection as unknown as { emit: (event: string) => void }).emit('close');
    await flush();

    expect(amqp.connect).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect on close after the module has been destroyed', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    consumer.onModuleInit();
    await flush();
    await consumer.onModuleDestroy();

    (connection as unknown as { emit: (event: string) => void }).emit('close');
    await flush();

    expect(amqp.connect).toHaveBeenCalledTimes(1);
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

  describe('delivery guarantees', () => {
    async function start() {
      const channel = buildChannel();
      (amqp.connect as jest.Mock).mockResolvedValue(buildConnection(channel));
      consumer.onModuleInit();
      await flush();
      const deliver = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
      return { channel, deliver };
    }

    it('acks a redelivery of an already-sent message without sending the e-mail again', async () => {
      const { channel, deliver } = await start();
      const event = buildEvent();

      deliver(buildMessage(event, {}, 'msg-1'));
      await flush();
      deliver(buildMessage(event, {}, 'msg-1'));
      await flush();

      expect(emailService.sendOrderStatusEmail).toHaveBeenCalledTimes(1);
      expect(channel.ack).toHaveBeenCalledTimes(2);
    });

    it('does not remember a message whose send failed, so the retry still sends', async () => {
      jest.useFakeTimers();
      const channel = buildChannel();
      (amqp.connect as jest.Mock).mockResolvedValue(buildConnection(channel));
      emailService.sendOrderStatusEmail.mockRejectedValueOnce(new Error('SMTP down')).mockResolvedValue(undefined);
      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      const deliver = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;

      deliver(buildMessage(buildEvent(), {}, 'msg-2'));
      await jest.advanceTimersByTimeAsync(5_000);
      deliver(buildMessage(buildEvent(), { 'x-retry-count': 1 }, 'msg-2'));
      await jest.advanceTimersByTimeAsync(5_000);

      expect(emailService.sendOrderStatusEmail).toHaveBeenCalledTimes(2);
    });

    it('keeps the message id when it republishes for a retry', async () => {
      jest.useFakeTimers();
      const channel = buildChannel();
      (amqp.connect as jest.Mock).mockResolvedValue(buildConnection(channel));
      emailService.sendOrderStatusEmail.mockRejectedValue(new Error('SMTP down'));
      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      const deliver = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;

      deliver(buildMessage(buildEvent(), {}, 'msg-3'));
      await jest.advanceTimersByTimeAsync(5_000);

      expect(channel.sendToQueue).toHaveBeenCalledWith(
        ORDER_STATUS_CHANGED_QUEUE,
        expect.anything(),
        expect.objectContaining({ messageId: 'msg-3' }),
      );
    });

    it('never deduplicates a message that carries no id', async () => {
      const { deliver } = await start();

      deliver(buildMessage(buildEvent()));
      await flush();
      deliver(buildMessage(buildEvent()));
      await flush();

      expect(emailService.sendOrderStatusEmail).toHaveBeenCalledTimes(2);
    });

    it('sends a permanent e-mail failure straight to the DLQ, without retries or the address in the log', async () => {
      jest.useFakeTimers();
      const channel = buildChannel();
      (amqp.connect as jest.Mock).mockResolvedValue(buildConnection(channel));
      emailService.sendOrderStatusEmail.mockRejectedValue(new PermanentEmailError('recipient refused'));
      const errorSpy = jest.spyOn((consumer as unknown as { logger: { error: () => void } }).logger, 'error');
      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      const deliver = channel.consume.mock.calls[0][1] as (message: amqp.ConsumeMessage) => void;
      const message = buildMessage(buildEvent());

      deliver(message);
      await jest.advanceTimersByTimeAsync(5_000);

      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
      expect(channel.sendToQueue).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('alice@example.com');
    });
  });
});
