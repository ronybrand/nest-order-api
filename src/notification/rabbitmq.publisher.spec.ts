import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitMqPublisher } from './rabbitmq.publisher';
import { ORDER_STATUS_CHANGED_DLQ, ORDER_STATUS_CHANGED_QUEUE, QUEUE_ARGUMENTS } from './rabbitmq.constants';
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

describe('RabbitMqPublisher', () => {
  let publisher: RabbitMqPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new RabbitMqPublisher(buildConfigService());
  });

  it('publishes to the order.status.changed queue', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    const event = buildEvent();
    await publisher.publish(event);

    expect(channel.assertQueue).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_DLQ, { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_QUEUE, {
      durable: true,
      arguments: QUEUE_ARGUMENTS,
    });
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      ORDER_STATUS_CHANGED_QUEUE,
      Buffer.from(JSON.stringify(event)),
      { persistent: true, contentType: 'application/json' },
    );
  });

  it('reuses the same channel across publish() calls', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    await publisher.publish(buildEvent());
    await publisher.publish(buildEvent());

    expect(amqp.connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects on the next publish() after the connection closes', async () => {
    const firstChannel = buildChannel();
    const firstConnection = buildConnection(firstChannel);
    const secondChannel = buildChannel();
    const secondConnection = buildConnection(secondChannel);
    (amqp.connect as jest.Mock).mockResolvedValueOnce(firstConnection).mockResolvedValueOnce(secondConnection);

    await publisher.publish(buildEvent());
    firstConnection.emit('close');
    await publisher.publish(buildEvent());

    expect(amqp.connect).toHaveBeenCalledTimes(2);
    expect(secondChannel.sendToQueue).toHaveBeenCalledTimes(1);
  });

  it('closes the channel and connection on module destroy', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    await publisher.publish(buildEvent());
    await publisher.onModuleDestroy();

    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });
});
