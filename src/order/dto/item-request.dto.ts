import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

export class ItemRequestDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsPositive()
  unitPrice!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;
}
