import { Operator } from './operator.enum';

export interface FilterCriterion {
  field: string;
  operator: Operator;
  value: string;
}

export class SearchRequestDto {
  filter?: Record<string, string | Record<string, string>>;
  sort?: string;
  order?: 'asc' | 'desc' = 'asc';
  page?: number = 0;
  size?: number = 20;
}
