import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { OrderStatusListener } from './order-status.listener';
import { RabbitMqConsumer } from './rabbitmq.consumer';
import { RabbitMqPublisher } from './rabbitmq.publisher';

@Module({
  providers: [EmailService, OrderStatusListener, RabbitMqPublisher, RabbitMqConsumer],
})
export class NotificationModule {}
