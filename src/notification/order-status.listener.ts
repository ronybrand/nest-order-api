import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_STATUS_CHANGED_EVENT, OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { EmailService } from './email.service';

/**
 * Consome OrderStatusChangedEvent de forma assíncrona (fora do ciclo de
 * request/response do controller) e dispara a notificação por e-mail.
 * Equivalente ao par Spring @TransactionalEventListener + RabbitMQ do
 * projeto de referência; aqui simplificado para EventEmitter2 in-process.
 * Se o volume justificar desacoplamento entre processos, troque o emit por
 * publish numa fila (ex. BullMQ) sem alterar o service que dispara o evento.
 */
@Injectable()
export class OrderStatusListener {
  private readonly logger = new Logger(OrderStatusListener.name);

  constructor(private readonly emailService: EmailService) {}

  @OnEvent(ORDER_STATUS_CHANGED_EVENT, { async: true })
  async handleOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await this.emailService.sendOrderStatusEmail(event);
    } catch (error) {
      this.logger.error(`Failed to send order status email: orderId=${event.orderId}`, error as Error);
    }
  }
}
