import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Max, MaxLength } from 'class-validator';
import { OrderConstants } from '../order.constants';

export class ItemRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(OrderConstants.MAX_UNIT_PRICE)
  unitPrice!: number;

  @IsInt()
  @IsPositive()
  @Max(OrderConstants.MAX_QUANTITY)
  quantity!: number;
}
