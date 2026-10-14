import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EnvConfig, getEnv } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { maskEmail } from '../common/security/sensitive.decorator';
import { buildOrderStatusEmailHtml } from './order-status-email.template';

/**
 * Envia o e-mail de notificação de status via SMTP (nodemailer). Em dev/local, SMTP_HOST
 * aponta para o Mailpit (docker-compose) - nenhum e-mail real sai, mas o fluxo de envio roda
 * de ponta a ponta e o resultado é inspecionável em http://localhost:8025.
 */
/** Falha que nenhuma nova tentativa resolve (destinatario recusado): a mensagem vai direto para a DLQ. */
export class PermanentEmailError extends Error {}

function isPermanentSmtpFailure(error: unknown): boolean {
  const failure = error as { code?: string; responseCode?: number; command?: string };
  const refusedRecipient =
    typeof failure.responseCode === 'number' &&
    failure.responseCode >= 500 &&
    failure.responseCode < 600 &&
    failure.command === 'RCPT TO';
  return failure.code === 'EENVELOPE' || refusedRecipient;
}

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

    const smtp = getEnv(this.configService, 'smtp');
    try {
      await this.getTransporter(smtp).sendMail({
        from: smtp.from,
        to: event.customerEmail,
        subject,
        html: buildOrderStatusEmailHtml(event),
      });
    } catch (error) {
      // Discard the cached transporter so the next attempt reconnects instead of reusing a
      // connection that may be stale/broken (e.g. after the SMTP server dropped it).
      this.transporter = undefined;
      if (isPermanentSmtpFailure(error)) {
        // Sem o endereco na mensagem (PII).
        throw new PermanentEmailError('Recipient refused by the SMTP server');
      }
      throw error;
    }
  }

  private getTransporter(smtp: EnvConfig['smtp']): nodemailer.Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      // secure:false + requireTLS = conexao em texto claro que e OBRIGADA a subir para TLS (STARTTLS) antes de
      // enviar qualquer coisa, inclusive credencial; sem requireTLS o nodemailer cairia para texto claro.
      secure: false,
      requireTLS: smtp.starttls === true,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
    });
    return this.transporter;
  }
}
