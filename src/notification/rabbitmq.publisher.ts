import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EnvConfig } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';

export const ORDER_STATUS_CHANGED_QUEUE = 'order.status.changed';

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
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(ORDER_STATUS_CHANGED_QUEUE, { durable: true });
    return this.channel;
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
