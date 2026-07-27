import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { OrderStatusListener } from './order-status.listener';

@Module({
  providers: [EmailService, OrderStatusListener],
})
export class NotificationModule {}
