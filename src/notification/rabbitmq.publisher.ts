import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getEnv } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { ORDER_STATUS_CHANGED_QUEUE } from './rabbitmq.constants';
import { AmqpConnectionManager } from './amqp-connection-manager';

/**
 * Publica OrderStatusChangedEvent no RabbitMQ: desacopla o efeito colateral (envio de
 * e-mail) do ciclo de request/response, com um broker real entre o listener e o consumer
 * em vez de um EventEmitter2 in-process.
 *
 * A conexão é lazy e reaproveitada entre publish()s (uma por instância do módulo); se cair,
 * a próxima chamada reconecta antes de publicar.
 */
@Injectable()
export class RabbitMqPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqPublisher.name);
  private readonly amqp: AmqpConnectionManager;

  constructor(configService: ConfigService) {
    this.amqp = new AmqpConnectionManager(
      this.logger,
      () => getEnv(configService, 'rabbitmq').url,
      () => this.logger.warn('RabbitMQ connection closed, will reconnect on next publish()'),
    );
  }

  async publish(event: OrderStatusChangedEvent): Promise<void> {
    const channel = await this.amqp.getChannel();
    channel.sendToQueue(ORDER_STATUS_CHANGED_QUEUE, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.amqp.close();
  }
}
