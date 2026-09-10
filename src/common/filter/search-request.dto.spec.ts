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
});
