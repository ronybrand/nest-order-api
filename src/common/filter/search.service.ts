import { Injectable } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { ErrorCode } from '../exceptions/error-code.enum';
import { InvalidInputException } from '../exceptions/domain.exception';
import { FilterCriterion, SearchRequestDto } from './search-request.dto';
import { Operator } from './operator.enum';
import { PaginationConfig } from '../config/pagination.config';
import { toPageResponse } from './page-response.util';
import { SearchLimits } from './search-limits';
import { coerceFilterValue, FilterableColumn, kindOf } from './filter-value';

/** Assinatura comum aos `search()` de CustomerService/OrderService - o que `executeSearch` chama por dentro. */
type SearchFn<T> = (
  criteria: FilterCriterion[],
  sort: string | undefined,
  order: 'asc' | 'desc' | undefined,
  page: number | undefined,
  size: number | undefined,
) => Promise<Page<T>>;

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
    const entries = Object.entries(raw);
    if (entries.length > SearchLimits.MAX_FILTER_FIELDS) {
      throw this.exceedsLimits();
    }
    const criteria: FilterCriterion[] = [];
    for (const [field, value] of entries) {
      if (typeof value === 'string') {
        criteria.push({ field, operator: Operator.EQ, value: this.checkedValue(value) });
        continue;
      }
      if (typeof value === 'object' && value !== null) {
        const operators = Object.entries(value as Record<string, unknown>);
        if (operators.length > SearchLimits.MAX_CONDITIONS_PER_FIELD) {
          throw this.exceedsLimits();
        }
        for (const [operator, operatorValue] of operators) {
          criteria.push({
            field,
            operator: this.parseOperator(operator),
            value: this.checkedValue(operatorValue),
          });
        }
      }
    }
    return criteria;
  }

  private invalidFilter(field: string): InvalidInputException {
    return new InvalidInputException(ErrorCode.VALIDATION_INVALID_FILTER_VALUE, `Invalid value for field: ${field}`, {
      field,
    });
  }

  private checkedValue(value: unknown): string {
    if (typeof value !== 'string' || value.length > SearchLimits.MAX_VALUE_LENGTH) {
      throw this.exceedsLimits();
    }
    return value;
  }

  private exceedsLimits(): InvalidInputException {
    return new InvalidInputException(
      ErrorCode.VALIDATION_INVALID_FILTER_VALUE,
      'Search filters exceed the allowed limits',
      {},
    );
  }

  parseBodyFilters(body: SearchRequestDto): FilterCriterion[] {
    return this.parseQueryFilters({ filter: body.filter } as Record<string, unknown>);
  }

  /**
   * Rotas `GET .../search` e `POST .../search` dos controllers de domínio
   * delegam para cá - só variam o `searchFn` (ex. `customerService.search`)
   * e o mapper de resposta (ex. `CustomerResponseDto.from`). `dto` já chega
   * validado pelo ValidationPipe global (whitelist + coerção de page/size via
   * @Type em SearchRequestDto), seja via @Query() ou @Body() - por isso um
   * único método cobre as duas rotas em vez de reimplementar parse manual de
   * query string.
   */
  async executeSearch<T extends ObjectLiteral, R>(
    dto: SearchRequestDto,
    searchFn: SearchFn<T>,
    mapper: (entity: T) => R,
  ): Promise<Page<R>> {
    const criteria = this.parseBodyFilters(dto);
    const page = await searchFn(criteria, dto.sort, dto.order, dto.page, dto.size);
    return toPageResponse(page, mapper);
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
    const columnsByName = new Map<string, FilterableColumn>(metadata.columns.map((c) => [c.propertyName, c]));
    const filterableColumns = new Set(columnsByName.keys());

    if (filterableColumns.has('deletedAt')) {
      qb.andWhere(`${alias}.deletedAt IS NULL`);
    }

    let paramIndex = 0;
    for (const criterion of criteria) {
      if (!filterableColumns.has(criterion.field)) {
        // Filtro por campo inexistente é ignorado silenciosamente (nunca erro).
        continue;
      }
      this.applyFilter(qb, alias, criterion, columnsByName.get(criterion.field)!, paramIndex++);
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
    if (page * effectiveSize > SearchLimits.MAX_OFFSET) {
      throw new InvalidInputException(ErrorCode.VALIDATION_CONSTRAINT_VIOLATION, 'page is too large', {
        field: 'page',
      });
    }
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
    columnMeta: FilterableColumn,
    paramIndex: number,
  ): void {
    const param = `${criterion.field}_${paramIndex}`;
    const column = `${alias}.${criterion.field}`;
    const kind = kindOf(columnMeta);
    const orderingOperators = [Operator.LT, Operator.LTE, Operator.GT, Operator.GTE, Operator.BETWEEN];
    if (orderingOperators.includes(criterion.operator) && (kind === 'enum' || kind === 'boolean')) {
      // Enum e bool so tem igualdade/pertinencia: "maior que" num enum compara texto e nao significa nada.
      throw this.invalidFilter(criterion.field);
    }
    const scalar = () => coerceFilterValue(columnMeta, criterion.value);

    switch (criterion.operator) {
      case Operator.EQ:
        qb.andWhere(`${column} = :${param}`, { [param]: scalar() });
        break;
      case Operator.NEQ:
        qb.andWhere(`${column} != :${param}`, { [param]: scalar() });
        break;
      case Operator.LT:
        qb.andWhere(`${column} < :${param}`, { [param]: scalar() });
        break;
      case Operator.LTE:
        qb.andWhere(`${column} <= :${param}`, { [param]: scalar() });
        break;
      case Operator.GT:
        qb.andWhere(`${column} > :${param}`, { [param]: scalar() });
        break;
      case Operator.GTE:
        qb.andWhere(`${column} >= :${param}`, { [param]: scalar() });
        break;
      case Operator.IN: {
        const parts = criterion.value.split(',');
        if (parts.length > SearchLimits.MAX_IN_VALUES) {
          throw this.invalidFilter(criterion.field);
        }
        qb.andWhere(`${column} IN (:...${param})`, {
          [param]: parts.map((part) => coerceFilterValue(columnMeta, part)),
        });
        break;
      }
      case Operator.BETWEEN: {
        const parts = criterion.value.split(',');
        if (parts.length !== 2) {
          throw this.invalidFilter(criterion.field);
        }
        qb.andWhere(`${column} BETWEEN :${param}From AND :${param}To`, {
          [`${param}From`]: coerceFilterValue(columnMeta, parts[0]),
          [`${param}To`]: coerceFilterValue(columnMeta, parts[1]),
        });
        break;
      }
      case Operator.LK: {
        if (kind !== 'text') {
          throw this.invalidFilter(criterion.field);
        }
        // % e _ do termo do cliente sao literais, nao curingas (a barra e o escape do LIKE).
        const escaped = criterion.value.replace(/[\\%_]/g, '\\$&');
        qb.andWhere(`${column} ILIKE :${param} ESCAPE '\\'`, { [param]: `%${escaped}%` });
        break;
      }
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
