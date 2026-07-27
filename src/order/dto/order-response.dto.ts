import { Order } from '../order.entity';
import { OrderStatus } from '../order-status.enum';
import { ItemResponseDto } from './item-response.dto';
import { CustomerResponseDto } from '../../customer/dto/customer-response.dto';

export class OrderResponseDto {
  id!: string;
  customer!: CustomerResponseDto;
  items!: ItemResponseDto[];
  total!: string;
  status!: OrderStatus;
  createdAt!: Date;
  updatedAt!: Date;

  static from(order: Order): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = order.id;
    dto.customer = CustomerResponseDto.from(order.customer);
    dto.items = order.items.map((item) => ItemResponseDto.from(item));
    dto.total = order.total;
    dto.status = order.status;
    dto.createdAt = order.createdAt;
    dto.updatedAt = order.updatedAt;
    return dto;
  }
}
