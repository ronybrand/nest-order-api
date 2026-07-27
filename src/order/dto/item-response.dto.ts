import { Item } from '../item.entity';

export class ItemResponseDto {
  id!: string;
  description!: string;
  unitPrice!: string;
  quantity!: number;
  subtotal!: string;

  static from(item: Item): ItemResponseDto {
    const dto = new ItemResponseDto();
    dto.id = item.id;
    dto.description = item.description;
    dto.unitPrice = item.unitPrice;
    dto.quantity = item.quantity;
    dto.subtotal = item.subtotal();
    return dto;
  }
}
