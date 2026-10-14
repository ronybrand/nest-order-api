import { coerceFilterValue } from './filter-value';
import { InvalidInputException } from '../exceptions/domain.exception';

const column = (type: unknown, extra: Record<string, unknown> = {}) => ({ propertyName: 'field', type, ...extra });

describe('coerceFilterValue', () => {
  it('accepts a canonical uuid and lowercases it', () => {
    expect(coerceFilterValue(column('uuid'), '3F2A9C1E-0000-4000-8000-000000000001')).toBe(
      '3f2a9c1e-0000-4000-8000-000000000001',
    );
  });

  it.each(['abc', '3f2a9c1e', '', '3f2a9c1e-0000-4000-8000-00000000000g'])('rejects %p as a uuid', (value) => {
    expect(() => coerceFilterValue(column('uuid'), value)).toThrow(InvalidInputException);
  });

  it.each(['int', 'integer', 'smallint', 'bigint'])('parses whole numbers for %s columns', (type) => {
    expect(coerceFilterValue(column(type), '42')).toBe(42);
    expect(coerceFilterValue(column(type), '-7')).toBe(-7);
  });

  it.each(['1.5', 'abc', '', '1e3', '9007199254740993', ' 1'])('rejects %p as an integer', (value) => {
    expect(() => coerceFilterValue(column('int'), value)).toThrow(InvalidInputException);
  });

  it.each(['decimal', 'numeric', 'float'])('keeps plain decimals as text for %s columns', (type) => {
    expect(coerceFilterValue(column(type), '10.50')).toBe('10.50');
    expect(coerceFilterValue(column(type), '-3')).toBe('-3');
  });

  it.each(['NaN', 'Infinity', '1e3', '1,5', '10.', '.5', ''])('rejects %p as a decimal', (value) => {
    expect(() => coerceFilterValue(column('decimal'), value)).toThrow(InvalidInputException);
  });

  it('parses strict booleans', () => {
    expect(coerceFilterValue(column('boolean'), 'true')).toBe(true);
    expect(coerceFilterValue(column('boolean'), 'FALSE')).toBe(false);
    expect(() => coerceFilterValue(column('boolean'), 'maybe')).toThrow(InvalidInputException);
    expect(() => coerceFilterValue(column('boolean'), '1')).toThrow(InvalidInputException);
  });

  it('accepts ISO 8601 dates and timestamps', () => {
    expect(coerceFilterValue(column('timestamptz'), '2025-01-02T03:04:05Z')).toBe('2025-01-02T03:04:05Z');
    expect(coerceFilterValue(column('date'), '2025-01-02')).toBe('2025-01-02');
  });

  it.each(['01/02/2025', 'Jan 2 2025', 'yesterday', '2025-13-45', ''])('rejects %p as a date', (value) => {
    expect(() => coerceFilterValue(column('timestamptz'), value)).toThrow(InvalidInputException);
  });

  it('accepts only declared enum values', () => {
    const status = column('enum', { enum: ['OPEN', 'CONFIRMED'] });
    expect(coerceFilterValue(status, 'OPEN')).toBe('OPEN');
    expect(() => coerceFilterValue(status, 'open')).toThrow(InvalidInputException);
    expect(() => coerceFilterValue(status, '1')).toThrow(InvalidInputException);
  });

  it('treats JS constructor types like their SQL counterparts', () => {
    expect(coerceFilterValue(column(Number), '5')).toBe('5');
    expect(() => coerceFilterValue(column(Number), 'x')).toThrow(InvalidInputException);
    expect(coerceFilterValue(column(String), 'anything')).toBe('anything');
    expect(coerceFilterValue(column(Boolean), 'true')).toBe(true);
    expect(() => coerceFilterValue(column(Date), 'yesterday')).toThrow(InvalidInputException);
  });

  it('leaves text and unknown column types untouched', () => {
    expect(coerceFilterValue(column('varchar'), 'Alice')).toBe('Alice');
    expect(coerceFilterValue({ propertyName: 'x' }, 'whatever')).toBe('whatever');
  });

  it('reports the offending field and never echoes the value', () => {
    expect.assertions(2);
    try {
      coerceFilterValue({ propertyName: 'taxId', type: 'int' }, 'SECRET-123');
    } catch (error) {
      expect(JSON.stringify((error as InvalidInputException).getResponse())).not.toContain('SECRET-123');
      expect(JSON.stringify((error as InvalidInputException).getResponse())).toContain('taxId');
    }
  });
});
