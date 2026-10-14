import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerRequestDto } from './customer-request.dto';

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CustomerRequestDto, {
    name: 'Ana',
    taxId: 'AB123456',
    email: 'ana@example.com',
    ...overrides,
  });

const failingProperties = async (dto: CustomerRequestDto) => (await validate(dto)).map((error) => error.property);

describe('CustomerRequestDto', () => {
  it('accepts a valid payload', async () => {
    await expect(validate(build())).resolves.toEqual([]);
  });

  describe('taxId canonical form', () => {
    it.each([
      ['123.456-78', '12345678'],
      ['ab-12.cd/9', 'AB12CD9'],
      ['abcde', 'ABCDE'],
      ['AB123456', 'AB123456'],
    ])('stores %p as %p', async (raw, canonical) => {
      const dto = build({ taxId: raw });

      expect(dto.taxId).toBe(canonical);
      await expect(validate(dto)).resolves.toEqual([]);
    });

    it('makes formatting differences collapse into the same document', () => {
      expect(build({ taxId: '123.456-78' }).taxId).toBe(build({ taxId: '12345678' }).taxId);
    });

    it.each(['.....', 'A.B-C', '-./-.-', 'ab.c', ''])('rejects %p (fewer than 5 letters or digits)', async (raw) => {
      await expect(failingProperties(build({ taxId: raw }))).resolves.toContain('taxId');
    });
  });
});
