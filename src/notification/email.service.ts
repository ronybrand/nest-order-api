import { Injectable, Logger } from '@nestjs/common';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';

/**
 * Stub de envio de e-mail. Numa integração real, plugue um provedor
 * (SES, SendGrid, SMTP via nodemailer) aqui — a interface pública
 * (`sendOrderStatusEmail`) não muda.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendOrderStatusEmail(event: OrderStatusChangedEvent): Promise<void> {
    this.logger.log(
      `Sending order status email: orderId=${event.orderId}, to=${event.customerEmail}, ` +
        `${event.oldStatus} -> ${event.newStatus}`,
    );
  }
}
