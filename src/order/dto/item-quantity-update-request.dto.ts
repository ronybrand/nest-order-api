import { IsInt, IsPositive } from 'class-validator';

export class ItemQuantityUpdateRequestDto {
  @IsInt()
  @IsPositive()
  quantity!: number;
}
