import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EnvConfig } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { maskEmail } from '../common/security/sensitive.decorator';
import { buildOrderStatusEmailHtml } from './order-status-email.template';

/**
 * Envia o e-mail de notificação de status via SMTP (nodemailer). Em dev/local, SMTP_HOST
 * aponta para o Mailpit (docker-compose) - nenhum e-mail real sai, mas o fluxo de envio roda
 * de ponta a ponta e o resultado é inspecionável em http://localhost:8025.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {}

  async sendOrderStatusEmail(event: OrderStatusChangedEvent): Promise<void> {
    const subject = `Order #${event.orderId.slice(0, 8).toUpperCase()} — ${event.newStatus}`;
    this.logger.log(
      `Sending order status email: orderId=${event.orderId}, to=${maskEmail(event.customerEmail)}, ` +
        `${event.oldStatus} -> ${event.newStatus}`,
    );

    const smtp = this.configService.get<EnvConfig['smtp']>('env.smtp')!;
    await this.getTransporter(smtp).sendMail({
      from: smtp.from,
      to: event.customerEmail,
      subject,
      html: buildOrderStatusEmailHtml(event),
    });
  }

  private getTransporter(smtp: EnvConfig['smtp']): nodemailer.Transporter {
    this.transporter ??= nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: false });
    return this.transporter;
  }
}
