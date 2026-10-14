import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService, PermanentEmailError } from './email.service';
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

  it('discards the cached transporter after a send failure so the next attempt reconnects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP connection reset'));

    const event = new OrderStatusChangedEvent(
      'order-3',
      'carol@example.com',
      'Carol',
      OrderStatus.OPEN,
      OrderStatus.CONFIRMED,
      '75.00',
      new Date(),
    );

    const callsBefore = (nodemailer.createTransport as jest.Mock).mock.calls.length;

    await expect(service.sendOrderStatusEmail(event)).rejects.toThrow('SMTP connection reset');
    await service.sendOrderStatusEmail(event);

    expect((nodemailer.createTransport as jest.Mock).mock.calls.length - callsBefore).toBe(2);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
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

  describe('SMTP transport', () => {
    const event = new OrderStatusChangedEvent(
      'order-9',
      'dave@example.com',
      'Dave',
      OrderStatus.OPEN,
      OrderStatus.CONFIRMED,
      '10.00',
      new Date(),
    );

    const serviceWith = (smtp: Record<string, unknown>) =>
      new EmailService({ get: () => ({ from: 'no-reply@order-api.local', ...smtp }) } as unknown as ConfigService);

    it('upgrades to TLS and authenticates when configured', async () => {
      await serviceWith({ host: 'smtp.example', port: 587, starttls: true, user: 'mailer', password: 'secret' })
        .sendOrderStatusEmail(event);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example',
          port: 587,
          secure: false,
          requireTLS: true,
          auth: { user: 'mailer', pass: 'secret' },
        }),
      );
    });

    it('stays unauthenticated and without TLS for the local default', async () => {
      await serviceWith({ host: 'localhost', port: 1025, starttls: false }).sendOrderStatusEmail(event);

      const options = (nodemailer.createTransport as jest.Mock).mock.calls.at(-1)[0];
      expect(options.requireTLS).toBe(false);
      expect(options.auth).toBeUndefined();
    });

    it('reports a refused recipient as a permanent failure (no point retrying)', async () => {
      const refused = Object.assign(new Error('No recipients defined'), { code: 'EENVELOPE' });
      sendMailMock.mockRejectedValueOnce(refused);

      await expect(
        serviceWith({ host: 'localhost', port: 1025 }).sendOrderStatusEmail(event),
      ).rejects.toBeInstanceOf(PermanentEmailError);
    });

    it('reports a 5xx answer to RCPT TO as a permanent failure', async () => {
      const rejected = Object.assign(new Error('550 no such user'), { responseCode: 550, command: 'RCPT TO' });
      sendMailMock.mockRejectedValueOnce(rejected);

      await expect(
        serviceWith({ host: 'localhost', port: 1025 }).sendOrderStatusEmail(event),
      ).rejects.toBeInstanceOf(PermanentEmailError);
    });

    it('keeps a connection failure as a plain error so it is retried', async () => {
      sendMailMock.mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }));

      await expect(
        serviceWith({ host: 'localhost', port: 1025 }).sendOrderStatusEmail(event),
      ).rejects.not.toBeInstanceOf(PermanentEmailError);
    });
  });
});
