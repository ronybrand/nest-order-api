import { IsValidQuantity } from './quantity.decorator';

export class ItemQuantityUpdateRequestDto {
  @IsValidQuantity()
  quantity!: number;
}
