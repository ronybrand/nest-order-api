import { ArrayMaxSize, ArrayMinSize, IsNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ItemRequestDto } from './item-request.dto';
import { OrderConstants } from '../order.constants';

export class OrderCreateRequestDto {
  @IsNotEmpty()
  @IsUUID()
  customerId!: string;

  @ValidateNested({ each: true })
  @Type(() => ItemRequestDto)
  @ArrayMinSize(0)
  @ArrayMaxSize(OrderConstants.MAX_ITEMS_PER_ORDER)
  items!: ItemRequestDto[];
}
