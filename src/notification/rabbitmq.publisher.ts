import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EnvConfig } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { ORDER_STATUS_CHANGED_DLQ, ORDER_STATUS_CHANGED_QUEUE, QUEUE_ARGUMENTS } from './rabbitmq.constants';

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
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private destroyed = false;

  constructor(private readonly configService: ConfigService) {}

  async publish(event: OrderStatusChangedEvent): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(ORDER_STATUS_CHANGED_QUEUE, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
    });
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (this.channel) {
      return this.channel;
    }

    const url = this.configService.get<EnvConfig['rabbitmq']>('env.rabbitmq')!.url;
    this.connection = await amqp.connect(url);
    this.connection.on('error', (error) => this.logger.error('RabbitMQ connection error', error));
    this.connection.on('close', () => {
      this.channel = undefined;
      this.connection = undefined;
      if (!this.destroyed) {
        this.logger.warn('RabbitMQ connection closed, will reconnect on next publish()');
      }
    });
    this.channel = await this.connection.createChannel();
    // Declarado com os mesmos argumentos que RabbitMqConsumer usa - RabbitMQ rejeita com
    // 406 PRECONDITION_FAILED se um lado declarar sem dead-letter e o outro com, então os
    // dois lados importam QUEUE_ARGUMENTS em vez de cada um declarar o seu.
    await this.channel.assertQueue(ORDER_STATUS_CHANGED_DLQ, { durable: true });
    await this.channel.assertQueue(ORDER_STATUS_CHANGED_QUEUE, { durable: true, arguments: QUEUE_ARGUMENTS });
    return this.channel;
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    await this.channel?.close();
    await this.connection?.close();
  }
}
