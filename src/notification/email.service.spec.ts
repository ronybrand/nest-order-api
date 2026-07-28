import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { OrderStatus } from '../order/order-status.enum';

jest.mock('nodemailer');

describe('EmailService', () => {
  let service: EmailService;
  let logSpy: jest.SpyInstance;
  let sendMailMock: jest.Mock;

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });

    const configService = {
      get: () => ({ host: 'localhost', port: 1025, from: 'no-reply@order-api.local' }),
    } as unknown as ConfigService;

    service = new EmailService(configService);
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
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com', subject: expect.stringContaining('CONFIRMED') }),
    );
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
