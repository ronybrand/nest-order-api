import { Injectable } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { ErrorCode } from '../exceptions/error-code.enum';
import { InvalidInputException } from '../exceptions/domain.exception';
import { FilterCriterion, SearchRequestDto } from './search-request.dto';
import { Operator } from './operator.enum';
import { PaginationConfig } from '../config/pagination.config';

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Motor de busca/filtro/paginação compartilhado. Nenhum domínio deve
 * reimplementar isso - service do domínio só monta os FilterCriterion e
 * delega para cá, igual ao SearchSpecification do projeto Java de
 * referência.
 *
 * Sintaxe suportada pelo cliente: filter[campo]=valor (eq implícito) ou
 * filter[campo][operador]=valor, operadores eq|neq|lt|lte|gt|gte|in|between|lk.
 * `page` é 0-based.
 */
@Injectable()
export class SearchService {
  parseQueryFilters(query: Record<string, unknown>): FilterCriterion[] {
    const raw = query.filter as Record<string, unknown> | undefined;
    if (!raw) {
      return [];
    }
    const criteria: FilterCriterion[] = [];
    for (const [field, value] of Object.entries(raw)) {
      if (typeof value === 'string') {
        criteria.push({ field, operator: Operator.EQ, value });
        continue;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [operator, operatorValue] of Object.entries(value as Record<string, string>)) {
          criteria.push({ field, operator: this.parseOperator(operator), value: operatorValue });
        }
      }
    }
    return criteria;
  }

  parseBodyFilters(body: SearchRequestDto): FilterCriterion[] {
    return this.parseQueryFilters({ filter: body.filter } as Record<string, unknown>);
  }

  async search<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    criteria: FilterCriterion[],
    sort: string | undefined,
    order: 'asc' | 'desc' = 'asc',
    page = PaginationConfig.defaultPage,
    size = PaginationConfig.defaultSize,
  ): Promise<Page<T>> {
    const qb = repository.createQueryBuilder(alias);
    const metadata = repository.metadata;
    const filterableColumns = new Set(metadata.columns.map((c) => c.propertyName));

    if (filterableColumns.has('deletedAt')) {
      qb.andWhere(`${alias}.deletedAt IS NULL`);
    }

    let paramIndex = 0;
    for (const criterion of criteria) {
      if (!filterableColumns.has(criterion.field)) {
        // Filtro por campo inexistente é ignorado silenciosamente (nunca erro).
        continue;
      }
      this.applyFilter(qb, alias, criterion, paramIndex++);
    }

    if (sort) {
      if (!filterableColumns.has(sort)) {
        throw new InvalidInputException(
          ErrorCode.VALIDATION_INVALID_SORT_FIELD,
          `Sort field "${sort}" does not exist`,
          { field: sort },
        );
      }
      qb.orderBy(`${alias}.${sort}`, order.toUpperCase() as 'ASC' | 'DESC');
      qb.addOrderBy(`${alias}.id`, 'ASC');
    } else {
      qb.orderBy(`${alias}.id`, 'ASC');
    }

    const effectiveSize = Math.min(size, PaginationConfig.maxSize);
    qb.skip(page * effectiveSize).take(effectiveSize);

    const [content, totalElements] = await qb.getManyAndCount();
    return {
      content,
      page,
      size: effectiveSize,
      totalElements,
      totalPages: Math.ceil(totalElements / effectiveSize) || 0,
    };
  }

  private applyFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    criterion: FilterCriterion,
    paramIndex: number,
  ): void {
    const param = `${criterion.field}_${paramIndex}`;
    const column = `${alias}.${criterion.field}`;

    switch (criterion.operator) {
      case Operator.EQ:
        qb.andWhere(`${column} = :${param}`, { [param]: criterion.value });
        break;
      case Operator.NEQ:
        qb.andWhere(`${column} != :${param}`, { [param]: criterion.value });
        break;
      case Operator.LT:
        qb.andWhere(`${column} < :${param}`, { [param]: criterion.value });
        break;
      case Operator.LTE:
        qb.andWhere(`${column} <= :${param}`, { [param]: criterion.value });
        break;
      case Operator.GT:
        qb.andWhere(`${column} > :${param}`, { [param]: criterion.value });
        break;
      case Operator.GTE:
        qb.andWhere(`${column} >= :${param}`, { [param]: criterion.value });
        break;
      case Operator.IN:
        qb.andWhere(`${column} IN (:...${param})`, { [param]: criterion.value.split(',') });
        break;
      case Operator.BETWEEN: {
        const [from, to] = criterion.value.split(',');
        qb.andWhere(`${column} BETWEEN :${param}From AND :${param}To`, {
          [`${param}From`]: from,
          [`${param}To`]: to,
        });
        break;
      }
      case Operator.LK:
        qb.andWhere(`${column} ILIKE :${param}`, { [param]: `%${criterion.value}%` });
        break;
      default:
        throw new InvalidInputException(
          ErrorCode.VALIDATION_INVALID_FILTER_VALUE,
          `Unsupported operator "${criterion.operator}"`,
          { field: criterion.field },
        );
    }
  }

  private parseOperator(raw: string): Operator {
    const match = Object.values(Operator).find((o) => o === raw);
    if (!match) {
      throw new InvalidInputException(ErrorCode.VALIDATION_INVALID_FILTER_VALUE, `Unsupported operator "${raw}"`);
    }
    return match;
  }
}
