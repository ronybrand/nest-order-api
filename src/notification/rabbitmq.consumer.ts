import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { getEnv } from '../config/env.config';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';
import { EmailService, PermanentEmailError } from './email.service';
import { RecentMessageIds } from './recent-message-ids';
import { MAX_RETRIES, ORDER_STATUS_CHANGED_QUEUE } from './rabbitmq.constants';
import { AmqpConnectionManager } from './amqp-connection-manager';

const REMEMBERED_MESSAGES = 10_000;
const RECONNECT_DELAY_MS = 5_000;
const RETRY_BACKOFF_MS = 2_000;

function isOrderStatusChangedEvent(value: unknown): value is OrderStatusChangedEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    typeof event.orderId === 'string' &&
    typeof event.customerEmail === 'string' &&
    typeof event.customerName === 'string' &&
    typeof event.oldStatus === 'string' &&
    typeof event.newStatus === 'string' &&
    typeof event.totalAmount === 'string' &&
    typeof event.changedAt === 'string'
  );
}

/**
 * Consome a fila `order.status.changed` e dispara o e-mail de notificação. Roda no mesmo
 * processo da API (start no OnModuleInit) em vez de um worker separado.
 *
 * Mensagem só recebe ack depois do envio bem-sucedido. Se `sendOrderStatusEmail` lançar, a
 * mensagem é reenviada para o fim da fila com um header `x-retry-count` incrementado (até
 * `MAX_RETRIES`), com um pequeno atraso para não girar em loop apertado; ao esgotar as
 * tentativas — ou se a mensagem estiver malformada/inválida de cara — ela é enviada para a
 * dead-letter queue (`ORDER_STATUS_CHANGED_DLQ`) em vez de ficar reprocessando indefinidamente.
 *
 * A conexão inicial roda em background (não bloqueia `onModuleInit`) e se reconecta a cada
 * `RECONNECT_DELAY_MS` se o broker estiver indisponível — o boot da aplicação (e os testes
 * e2e, que sobem o `AppModule` inteiro) nunca deve falhar só porque o RabbitMQ está fora do
 * ar; a notificação por e-mail é um efeito colateral best-effort, não um requisito de startup.
 */
@Injectable()
export class RabbitMqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumer.name);
  private readonly amqp: AmqpConnectionManager;
  private channel?: amqp.Channel;
  private destroyed = false;
  private readonly sentMessageIds = new RecentMessageIds(REMEMBERED_MESSAGES);

  constructor(
    configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.amqp = new AmqpConnectionManager(
      this.logger,
      () => getEnv(configService, 'rabbitmq').url,
      () => {
        this.channel = undefined;
        this.logger.warn('RabbitMQ connection closed, reconnecting...');
        void this.connectWithRetry();
      },
    );
  }

  onModuleInit(): void {
    void this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (!this.destroyed) {
      try {
        this.channel = await this.amqp.getChannel();
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

  /** Guarda de acesso ao canal em vez de `this.channel!` - erro explícito se chamado fora de uma consume() ativa. */
  private requireChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    return this.channel;
  }

  private async handleMessage(message: amqp.ConsumeMessage): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(message.content.toString());
    } catch (error) {
      this.logger.error('Malformed order status message, sending to DLQ', error as Error);
      this.requireChannel().nack(message, false, false);
      return;
    }

    if (!isOrderStatusChangedEvent(payload)) {
      this.logger.error('Order status message missing required fields, sending to DLQ');
      this.requireChannel().nack(message, false, false);
      return;
    }

    const messageId = message.properties.messageId as string | undefined;
    if (messageId && this.sentMessageIds.has(messageId)) {
      this.logger.log(`Duplicate delivery of messageId=${messageId} ignored`);
      this.requireChannel().ack(message);
      return;
    }

    try {
      await this.emailService.sendOrderStatusEmail(payload);
      if (messageId) {
        this.sentMessageIds.add(messageId);
      }
      this.requireChannel().ack(message);
    } catch (error) {
      if (error instanceof PermanentEmailError) {
        // Destinatario recusado nao melhora com retry: DLQ direto (e sem logar o endereco, que e PII).
        this.logger.error(`Permanent e-mail failure, sending to DLQ: orderId=${payload.orderId}`);
        this.requireChannel().nack(message, false, false);
        return;
      }
      await this.retryOrDeadLetter(message, error as Error);
    }
  }

  private async retryOrDeadLetter(message: amqp.ConsumeMessage, error: Error): Promise<void> {
    const previousRetryCount = (message.properties.headers?.['x-retry-count'] as number) ?? 0;
    const retryCount = previousRetryCount + 1;

    if (retryCount > MAX_RETRIES) {
      this.logger.error(`Exceeded ${MAX_RETRIES} retries, sending message to DLQ`, error);
      this.requireChannel().nack(message, false, false);
      return;
    }

    this.logger.warn(`Failed to process message (attempt ${retryCount}/${MAX_RETRIES}), retrying`, error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    this.requireChannel().sendToQueue(ORDER_STATUS_CHANGED_QUEUE, message.content, {
      persistent: true,
      contentType: 'application/json',
      messageId: message.properties.messageId as string | undefined,
      headers: { ...message.properties.headers, 'x-retry-count': retryCount },
    });
    this.requireChannel().ack(message);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    await this.amqp.close();
  }
}
