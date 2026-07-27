import { EmailService } from './email.service';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { OrderStatus } from '../order/order-status.enum';

describe('EmailService', () => {
  let service: EmailService;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new EmailService();
    logSpy = jest.spyOn((service as unknown as { logger: { log: (...a: unknown[]) => void } }).logger, 'log');
  });

  it('logs the notification without leaking the customer email in clear text', async () => {
    const event = new OrderStatusChangedEvent(
      'order-1',
      'alice@example.com',
      'Alice',
      OrderStatus.OPEN,
      OrderStatus.CONFIRMED,
      '100.00',
      new Date(),
    );

    await service.sendOrderStatusEmail(event);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('a***@example.com'));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('alice@example.com'));
  });

  it('masks an email with no domain as ***', async () => {
    const event = new OrderStatusChangedEvent(
      'order-2',
      'not-an-email',
      'Bob',
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELED,
      '50.00',
      new Date(),
    );

    await service.sendOrderStatusEmail(event);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('to=***'));
  });
});
