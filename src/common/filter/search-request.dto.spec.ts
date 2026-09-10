import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchRequestDto } from './search-request.dto';

/**
 * Reproduz exatamente as opções do ValidationPipe global (configure-app.ts):
 * whitelist:true + forbidNonWhitelisted:true rejeitava POST .../search com
 * filter no body porque `filter` não tinha nenhum decorator do class-validator.
 */
describe('SearchRequestDto', () => {
  it('accepts a body with filter (eq implícito e operador explícito) under the global whitelist rules', async () => {
    const instance = plainToInstance(SearchRequestDto, {
      filter: { name: 'foo', age: { gte: '18' } },
      sort: 'name',
      order: 'asc',
    });

    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
    expect(instance.filter).toEqual({ name: 'foo', age: { gte: '18' } });
  });

  it('rejects a non-object filter', async () => {
    const instance = plainToInstance(SearchRequestDto, { filter: 'not-an-object' });

    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('filter');
  });

  it('accepts a body without filter', async () => {
    const instance = plainToInstance(SearchRequestDto, { sort: 'name' });

    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
  });

  /**
   * GET .../search usa este mesmo DTO para validar a query string (ver
   * order.controller.ts/customer.controller.ts) - nesse caso page/size chegam
   * como string (ex. "2"), nunca como number, então o DTO precisa converter
   * antes de validar (@Type), não só aceitar um number já pronto.
   */
  describe('coerção de query string (GET .../search)', () => {
    it('converts page/size strings to numbers before validating', async () => {
      const instance = plainToInstance(SearchRequestDto, { page: '2', size: '10' });

      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(0);
      expect(instance.page).toBe(2);
      expect(instance.size).toBe(10);
    });

    it('rejects a non-numeric page instead of silently falling back to the default', async () => {
      const instance = plainToInstance(SearchRequestDto, { page: 'not-a-number' });

      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('page');
    });

    it('rejects a negative page', async () => {
      const instance = plainToInstance(SearchRequestDto, { page: '-1' });

      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('page');
    });

    it('rejects an order value outside asc/desc', async () => {
      const instance = plainToInstance(SearchRequestDto, { order: 'sideways' });

      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('order');
    });

    it('defaults page/size/order when absent from the query string', async () => {
      const instance = plainToInstance(SearchRequestDto, { sort: 'name' });

      const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(0);
      expect(instance.page).toBe(0);
      expect(instance.order).toBe('asc');
    });
  });
});
