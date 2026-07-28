import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EnvConfig } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { EmailService } from './email.service';
import { ORDER_STATUS_CHANGED_QUEUE } from './rabbitmq.publisher';

const RECONNECT_DELAY_MS = 5_000;

/**
 * Consome a fila `order.status.changed` e dispara o e-mail de notificação. Roda no mesmo
 * processo da API (start no OnModuleInit) em vez de um worker separado.
 *
 * Mensagem só recebe ack depois do envio bem-sucedido; se `sendOrderStatusEmail` lançar, a
 * mensagem volta pra fila (nack + requeue) para nova tentativa, em vez de ser perdida.
 *
 * A conexão inicial roda em background (não bloqueia `onModuleInit`) e se reconecta a cada
 * `RECONNECT_DELAY_MS` se o broker estiver indisponível — o boot da aplicação (e os testes
 * e2e, que sobem o `AppModule` inteiro) nunca deve falhar só porque o RabbitMQ está fora do
 * ar; a notificação por e-mail é um efeito colateral best-effort, não um requisito de startup.
 */
@Injectable()
export class RabbitMqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumer.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private destroyed = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    void this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (!this.destroyed) {
      try {
        const url = this.configService.get<EnvConfig['rabbitmq']>('env.rabbitmq')!.url;
        this.connection = await amqp.connect(url);
        this.connection.on('error', (error) => this.logger.error('RabbitMQ connection error', error));
        this.connection.on('close', () => {
          if (!this.destroyed) {
            this.logger.warn('RabbitMQ connection closed, reconnecting...');
            void this.connectWithRetry();
          }
        });
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(ORDER_STATUS_CHANGED_QUEUE, { durable: true });
        await this.channel.prefetch(10);

        await this.channel.consume(ORDER_STATUS_CHANGED_QUEUE, (message) => {
          if (message) {
            void this.handleMessage(message);
          }
        });
        return;
      } catch (error) {
        this.logger.warn(
          `RabbitMQ unavailable, retrying in ${RECONNECT_DELAY_MS}ms: ${(error as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }
  }

  private async handleMessage(message: amqp.ConsumeMessage): Promise<void> {
    try {
      const event = JSON.parse(message.content.toString()) as OrderStatusChangedEvent;
      await this.emailService.sendOrderStatusEmail(event);
      this.channel!.ack(message);
    } catch (error) {
      this.logger.error('Failed to process order status message, requeueing', error as Error);
      this.channel!.nack(message, false, true);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    await this.channel?.close();
    await this.connection?.close();
  }
}
