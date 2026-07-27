import { SearchService } from './search.service';
import { Operator } from './operator.enum';
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
