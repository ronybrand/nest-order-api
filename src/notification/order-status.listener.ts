import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_STATUS_CHANGED_EVENT, OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { RabbitMqPublisher } from './rabbitmq.publisher';

/**
 * Consome OrderStatusChangedEvent do EventEmitter2 in-process (fora do ciclo de
 * request/response do controller) e publica no RabbitMQ para processamento assíncrono
 * entre processos. O envio de e-mail em si acontece em `RabbitMqConsumer`, do lado
 * consumidor da fila.
 */
@Injectable()
export class OrderStatusListener {
  private readonly logger = new Logger(OrderStatusListener.name);

  constructor(private readonly publisher: RabbitMqPublisher) {}

  @OnEvent(ORDER_STATUS_CHANGED_EVENT, { async: true })
  async handleOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await this.publisher.publish(event);
    } catch (error) {
      this.logger.error(`Failed to publish order status event: orderId=${event.orderId}`, error as Error);
    }
  }
}
