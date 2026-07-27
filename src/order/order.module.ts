import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { Item } from './item.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { CommonModule } from '../common/common.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Item]), CommonModule, CustomerModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
