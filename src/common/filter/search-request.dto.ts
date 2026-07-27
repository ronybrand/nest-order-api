import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Operator } from './operator.enum';
import { PaginationConfig } from '../config/pagination.config';

export interface FilterCriterion {
  field: string;
  operator: Operator;
  value: string;
}

export class SearchRequestDto {
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
