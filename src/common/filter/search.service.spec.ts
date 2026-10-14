import { SearchService } from './search.service';
import { Operator } from './operator.enum';
import { SearchLimits } from './search-limits';
import { InvalidInputException } from '../exceptions/domain.exception';

type MockQueryBuilder = {
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
};

function mockQueryBuilder(): MockQueryBuilder {
  const qb: Partial<MockQueryBuilder> = {};
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.addOrderBy = jest.fn().mockReturnValue(qb);
  qb.skip = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb as MockQueryBuilder;
}

function mockRepository(columns: string[], qb: MockQueryBuilder) {
  return {
    createQueryBuilder: jest.fn(() => qb),
    metadata: { columns: columns.map((propertyName) => ({ propertyName })) },
  };
}

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService();
  });

  describe('parseQueryFilters', () => {
    it('returns an empty array when there is no filter', () => {
      expect(service.parseQueryFilters({})).toEqual([]);
    });

    it('parses a plain string value as an implicit eq', () => {
      const criteria = service.parseQueryFilters({ filter: { name: 'Alice' } });
      expect(criteria).toEqual([{ field: 'name', operator: Operator.EQ, value: 'Alice' }]);
    });

    it('parses an explicit operator object', () => {
      const criteria = service.parseQueryFilters({ filter: { total: { gte: '100' } } });
      expect(criteria).toEqual([{ field: 'total', operator: Operator.GTE, value: '100' }]);
    });

    it('throws InvalidInputException for an unsupported operator', () => {
      expect(() => service.parseQueryFilters({ filter: { total: { bogus: '1' } } })).toThrow(
        InvalidInputException,
      );
    });
  });

  describe('parseBodyFilters', () => {
    it('delegates to parseQueryFilters using the body filter', () => {
      const criteria = service.parseBodyFilters({ filter: { status: 'OPEN' } } as never);
      expect(criteria).toEqual([{ field: 'status', operator: Operator.EQ, value: 'OPEN' }]);
    });
  });

  /**
   * Rota GET e POST .../search dos controllers de domínio delegam para cá -
   * ver customer.controller.ts/order.controller.ts. O mesmo SearchRequestDto
   * (já validado pelo ValidationPipe global, seja via @Query() ou @Body())
   * alimenta os dois, então um único método cobre ambos.
   */
  describe('executeSearch', () => {
    it('parses dto.filter, calls searchFn with dto.sort/order/page/size, and maps the page content', async () => {
      const searchFn = jest.fn().mockResolvedValue({
        content: [{ id: '1' }],
        page: 2,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      });
      const mapper = (entity: { id: string }) => ({ mapped: entity.id });

      const result = await service.executeSearch(
        { filter: { status: 'OPEN' }, sort: 'status', order: 'desc', page: 2, size: 10 } as never,
        searchFn,
        mapper,
      );

      expect(searchFn).toHaveBeenCalledWith(
        [{ field: 'status', operator: Operator.EQ, value: 'OPEN' }],
        'status',
        'desc',
        2,
        10,
      );
      expect(result.content).toEqual([{ mapped: '1' }]);
      expect(result.page).toBe(2);
    });

    it('passes through an absent filter as an empty criteria list', async () => {
      const searchFn = jest.fn().mockResolvedValue({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });

      await service.executeSearch({ sort: 'name' } as never, searchFn, (x) => x);

      expect(searchFn).toHaveBeenCalledWith([], 'name', undefined, undefined, undefined);
    });
  });

  describe('search', () => {
    it('scopes to non-deleted rows when the entity has a deletedAt column', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id', 'deletedAt'], qb);

      await service.search(repo as never, 'order', [], undefined, 'asc', 0, 20);

      expect(qb.andWhere).toHaveBeenCalledWith('order.deletedAt IS NULL');
    });

    it('silently ignores filters on fields that do not exist', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id'], qb);

      await service.search(
        repo as never,
        'order',
        [{ field: 'nonExistent', operator: Operator.EQ, value: 'x' }],
        undefined,
      );

      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('nonExistent'), expect.anything());
    });

    it('applies each supported operator to the query builder', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id', 'total', 'status', 'name'], qb);

      await service.search(
        repo as never,
        'order',
        [
          { field: 'total', operator: Operator.NEQ, value: '10' },
          { field: 'total', operator: Operator.LT, value: '10' },
          { field: 'total', operator: Operator.LTE, value: '10' },
          { field: 'total', operator: Operator.GT, value: '10' },
          { field: 'status', operator: Operator.IN, value: 'OPEN,CONFIRMED' },
          { field: 'total', operator: Operator.BETWEEN, value: '1,10' },
          { field: 'name', operator: Operator.LK, value: 'ali' },
        ],
        undefined,
      );

      const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][];
      expect(calls.some(([sql]) => sql.includes('total !='))).toBe(true);
      expect(calls.some(([sql]) => sql.includes('total <') && !sql.includes('<='))).toBe(true);
      expect(calls.some(([sql]) => sql.includes('total <='))).toBe(true);
      expect(calls.some(([sql]) => sql.includes('total >') && !sql.includes('>='))).toBe(true);
      const inCall = calls.find(([sql]) => sql.includes('status IN'));
      expect(Object.values(inCall![1])[0]).toEqual(['OPEN', 'CONFIRMED']);
      const betweenCall = calls.find(([sql]) => sql.includes('BETWEEN'));
      expect(Object.values(betweenCall![1])).toEqual(['1', '10']);
      const lkCall = calls.find(([sql]) => sql.includes('ILIKE'));
      expect(Object.values(lkCall![1])[0]).toBe('%ali%');
    });

    it('throws InvalidInputException when sorting by a field that does not exist', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id'], qb);

      await expect(service.search(repo as never, 'order', [], 'bogusField')).rejects.toBeInstanceOf(
        InvalidInputException,
      );
    });

    it('caps the effective page size at the configured maximum', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id'], qb);

      const result = await service.search(repo as never, 'order', [], undefined, 'asc', 0, 10000);

      expect(result.size).toBe(100);
      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('computes totalPages from totalElements and effective size', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[{ id: '1' }, { id: '2' }], 45]);
      const repo = mockRepository(['id'], qb);

      const result = await service.search(repo as never, 'order', [], undefined, 'asc', 0, 20);

      expect(result.totalElements).toBe(45);
      expect(result.totalPages).toBe(3);
      expect(result.content).toHaveLength(2);
    });

    it('returns zero totalPages when there are no results', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id'], qb);

      const result = await service.search(repo as never, 'order', [], undefined, 'asc', 0, 20);

      expect(result.totalPages).toBe(0);
    });

    it('generates deterministic, sequential SQL parameter names instead of random ones', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id', 'total'], qb);

      await service.search(
        repo as never,
        'order',
        [
          { field: 'total', operator: Operator.GTE, value: '10' },
          { field: 'total', operator: Operator.LTE, value: '20' },
        ],
        undefined,
      );

      const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][];
      const paramNames = calls.map(([, params]) => Object.keys(params)[0]);
      expect(paramNames).toEqual(['total_0', 'total_1']);
    });

    it('does not leak the parameter counter across separate search() calls', async () => {
      const qb1 = mockQueryBuilder();
      const repo1 = mockRepository(['id', 'total'], qb1);
      await service.search(
        repo1 as never,
        'order',
        [{ field: 'total', operator: Operator.EQ, value: '1' }],
        undefined,
      );

      const qb2 = mockQueryBuilder();
      const repo2 = mockRepository(['id', 'total'], qb2);
      await service.search(
        repo2 as never,
        'order',
        [{ field: 'total', operator: Operator.EQ, value: '1' }],
        undefined,
      );

      expect(Object.keys(qb1.andWhere.mock.calls[0][1])[0]).toBe('total_0');
      expect(Object.keys(qb2.andWhere.mock.calls[0][1])[0]).toBe('total_0');
    });

    it('uses the sequential index suffix for BETWEEN bounds too', async () => {
      const qb = mockQueryBuilder();
      const repo = mockRepository(['id', 'total'], qb);

      await service.search(
        repo as never,
        'order',
        [{ field: 'total', operator: Operator.BETWEEN, value: '1,10' }],
        undefined,
      );

      const [, params] = qb.andWhere.mock.calls[0];
      expect(Object.keys(params)).toEqual(['total_0From', 'total_0To']);
    });
  });
});

describe('SearchService typed filters, limits and paging bounds', () => {
  const service = new SearchService();

  const columns = [
    { propertyName: 'id', type: 'uuid' },
    { propertyName: 'name', type: 'varchar' },
    { propertyName: 'total', type: 'decimal' },
    { propertyName: 'quantity', type: 'int' },
    { propertyName: 'active', type: 'boolean' },
    { propertyName: 'createdAt', type: 'timestamptz' },
    { propertyName: 'status', type: 'enum', enum: ['OPEN', 'CONFIRMED'] },
  ];

  function repo(qb: MockQueryBuilder) {
    return { createQueryBuilder: jest.fn(() => qb), metadata: { columns } };
  }

  const run = (criteria: { field: string; operator: Operator; value: string }[], page = 0, size = 20) => {
    const qb = mockQueryBuilder();
    return { qb, result: service.search(repo(qb) as never, 'e', criteria, undefined, 'asc', page, size) };
  };

  it('passes a coerced value to the database instead of the raw text', async () => {
    const { qb, result } = run([{ field: 'quantity', operator: Operator.GT, value: '5' }]);
    await result;
    expect(qb.andWhere).toHaveBeenCalledWith('e.quantity > :quantity_0', { quantity_0: 5 });
  });

  it.each([
    ['id', Operator.EQ, 'not-a-uuid'],
    ['quantity', Operator.GTE, '1.5'],
    ['total', Operator.LT, 'abc'],
    ['active', Operator.EQ, 'yes'],
    ['createdAt', Operator.GTE, 'yesterday'],
    ['status', Operator.EQ, 'NOPE'],
  ])('rejects an invalid %s value for %s with a 400 instead of a database error', async (field, operator, value) => {
    const { result } = run([{ field, operator, value }]);
    await expect(result).rejects.toThrow(InvalidInputException);
  });

  it.each([Operator.LT, Operator.LTE, Operator.GT, Operator.GTE, Operator.BETWEEN])(
    'rejects the ordering operator %s on an enum column',
    async (operator) => {
      const { result } = run([{ field: 'status', operator, value: 'OPEN,CONFIRMED' }]);
      await expect(result).rejects.toThrow(InvalidInputException);
    },
  );

  it('rejects an ordering operator on a boolean column', async () => {
    const { result } = run([{ field: 'active', operator: Operator.GT, value: 'true' }]);
    await expect(result).rejects.toThrow(InvalidInputException);
  });

  it('allows lk only on text columns', async () => {
    const { result } = run([{ field: 'quantity', operator: Operator.LK, value: '1' }]);
    await expect(result).rejects.toThrow(InvalidInputException);
  });

  it('escapes % and _ in lk so they match literally', async () => {
    const { qb, result } = run([{ field: 'name', operator: Operator.LK, value: '50%_off\\' }]);
    await result;
    expect(qb.andWhere).toHaveBeenCalledWith("e.name ILIKE :name_0 ESCAPE '\\'", { name_0: '%50\\%\\_off\\\\%' });
  });

  it('coerces every element of an in list', async () => {
    const { qb, result } = run([{ field: 'quantity', operator: Operator.IN, value: '1,2,3' }]);
    await result;
    expect(qb.andWhere).toHaveBeenCalledWith('e.quantity IN (:...quantity_0)', { quantity_0: [1, 2, 3] });
  });

  it('rejects an in list above the limit', async () => {
    const value = Array.from({ length: SearchLimits.MAX_IN_VALUES + 1 }, (_, i) => i).join(',');
    const { result } = run([{ field: 'quantity', operator: Operator.IN, value }]);
    await expect(result).rejects.toThrow(InvalidInputException);
  });

  it('requires exactly two values for between', async () => {
    await expect(run([{ field: 'quantity', operator: Operator.BETWEEN, value: '1' }]).result).rejects.toThrow(
      InvalidInputException,
    );
    await expect(run([{ field: 'quantity', operator: Operator.BETWEEN, value: '1,2,3' }]).result).rejects.toThrow(
      InvalidInputException,
    );
    const { qb, result } = run([{ field: 'quantity', operator: Operator.BETWEEN, value: '1,5' }]);
    await result;
    expect(qb.andWhere).toHaveBeenCalledWith('e.quantity BETWEEN :quantity_0From AND :quantity_0To', {
      quantity_0From: 1,
      quantity_0To: 5,
    });
  });

  it('rejects an offset that does not fit a 32-bit integer', async () => {
    const { result } = run([], 2_147_483_647, 100);
    await expect(result).rejects.toThrow(InvalidInputException);
  });

  describe('parseQueryFilters limits', () => {
    it('rejects more filter fields than the limit', () => {
      const filter = Object.fromEntries(Array.from({ length: SearchLimits.MAX_FILTER_FIELDS + 1 }, (_, i) => [`f${i}`, 'x']));
      expect(() => service.parseQueryFilters({ filter })).toThrow(InvalidInputException);
    });

    it('rejects more conditions on one field than the limit', () => {
      const ops = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'between', 'lk'];
      const value = Object.fromEntries(ops.map((op) => [op, '1']));
      // 9 distinct operators fit under the limit of 10: the limit is on the count, so exceed it with a wide object
      const wide = { ...value, ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`eq${i}`, '1'])) };
      expect(() => service.parseQueryFilters({ filter: { total: wide } })).toThrow(InvalidInputException);
    });

    it('rejects a value longer than the limit', () => {
      const value = 'x'.repeat(SearchLimits.MAX_VALUE_LENGTH + 1);
      expect(() => service.parseQueryFilters({ filter: { name: value } })).toThrow(InvalidInputException);
    });

    it('rejects a non-string operator value', () => {
      expect(() => service.parseQueryFilters({ filter: { total: { gte: { nested: 'x' } } } })).toThrow(
        InvalidInputException,
      );
    });

    it('accepts every limit exactly', () => {
      const filter = Object.fromEntries(
        Array.from({ length: SearchLimits.MAX_FILTER_FIELDS }, (_, i) => [`f${i}`, 'x'.repeat(SearchLimits.MAX_VALUE_LENGTH)]),
      );
      expect(service.parseQueryFilters({ filter })).toHaveLength(SearchLimits.MAX_FILTER_FIELDS);
    });
  });
});
