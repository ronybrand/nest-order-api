import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Operator } from './operator.enum';
import { PaginationConfig } from '../config/pagination.config';

export interface FilterCriterion {
  field: string;
  operator: Operator;
  value: string;
}

export class SearchRequestDto {
  // Sem decorator, o ValidationPipe global (whitelist: true, forbidNonWhitelisted:
  // true - ver configure-app.ts) rejeitava com 400 "property filter should not
  // exist" qualquer POST .../search com filter no body. @IsObject() só valida a
  // forma no nível superior (chave -> string | objeto de operadores); os valores
  // internos continuam livres, como já era o caso em parseQueryFilters/applyFilter.
  @IsOptional()
  @IsObject()
  filter?: Record<string, string | Record<string, string>>;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsInt()
  @Min(0)
  page?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number = PaginationConfig.defaultSize;
}
