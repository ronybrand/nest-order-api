import { applyDecorators } from '@nestjs/common';
import { IsInt, IsPositive, Max } from 'class-validator';
import { OrderConstants } from '../order.constants';

/** Regra de validação de `quantity` compartilhada entre criar item e atualizar quantidade. */
export function IsValidQuantity(): PropertyDecorator {
  return applyDecorators(IsInt(), IsPositive(), Max(OrderConstants.MAX_QUANTITY));
}
