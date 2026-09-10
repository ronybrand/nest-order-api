import { Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { ORDER_STATUS_CHANGED_DLQ, ORDER_STATUS_CHANGED_QUEUE, QUEUE_ARGUMENTS } from './rabbitmq.constants';

/**
 * Ciclo de vida de conexão/canal AMQP compartilhado entre RabbitMqPublisher e
 * RabbitMqConsumer: os dois precisam conectar, declarar a mesma DLQ e a mesma
 * fila principal (mesmos QUEUE_ARGUMENTS - ver rabbitmq.constants.ts) antes de
 * usar o canal, e tratar error/close da mesma forma. O que cada lado faz
 * depois de ter canal (publish vs prefetch+consume) e como cada lado reage a
 * uma queda inesperada (reconectar no próximo publish() vs retry loop ativo)
 * diverge e fica em cada classe, via `onUnexpectedClose`.
 */
export class AmqpConnectionManager {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private destroyed = false;

  constructor(
    private readonly logger: Logger,
    private readonly getUrl: () => string,
    private readonly onUnexpectedClose?: () => void,
  ) {}

  /** Reaproveita o canal existente; conecta e declara as filas na primeira chamada (ou após uma queda). */
  async getChannel(): Promise<amqp.Channel> {
    if (this.channel) {
      return this.channel;
    }

    this.connection = await amqp.connect(this.getUrl());
    this.connection.on('error', (error) => this.logger.error('RabbitMQ connection error', error));
    this.connection.on('close', () => {
      this.channel = undefined;
      this.connection = undefined;
      if (!this.destroyed) {
        this.onUnexpectedClose?.();
      }
    });

    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(ORDER_STATUS_CHANGED_DLQ, { durable: true });
    await this.channel.assertQueue(ORDER_STATUS_CHANGED_QUEUE, { durable: true, arguments: QUEUE_ARGUMENTS });
    return this.channel;
  }

  async close(): Promise<void> {
    this.destroyed = true;
    await this.channel?.close();
    await this.connection?.close();
  }
}
