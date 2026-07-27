import { IsInt, IsPositive, Max } from 'class-validator';
import { OrderConstants } from '../order.constants';

export class ItemQuantityUpdateRequestDto {
  @IsInt()
  @IsPositive()
  @Max(OrderConstants.MAX_QUANTITY)
  quantity!: number;
}
