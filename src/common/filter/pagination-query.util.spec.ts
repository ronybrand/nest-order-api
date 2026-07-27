import { parseOrderParam, parsePageParam, parseSizeParam } from './pagination-query.util';
import { PaginationConfig } from '../config/pagination.config';

describe('parsePageParam', () => {
  it('returns the parsed integer for a valid non-negative value', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam(0)).toBe(0);
  });

  it('falls back to the default page for negative, non-integer, or missing values', () => {
    expect(parsePageParam('-1')).toBe(PaginationConfig.defaultPage);
    expect(parsePageParam('abc')).toBe(PaginationConfig.defaultPage);
    expect(parsePageParam(undefined)).toBe(PaginationConfig.defaultPage);
  });

  it('honors an explicit fallback override', () => {
    expect(parsePageParam('abc', 7)).toBe(7);
  });
});

describe('parseSizeParam', () => {
  it('returns the parsed integer for a valid value >= 1', () => {
    expect(parseSizeParam('10')).toBe(10);
  });

  it('falls back to the default size for zero, negative, non-integer, or missing values', () => {
    expect(parseSizeParam('0')).toBe(PaginationConfig.defaultSize);
    expect(parseSizeParam('-5')).toBe(PaginationConfig.defaultSize);
    expect(parseSizeParam('abc')).toBe(PaginationConfig.defaultSize);
    expect(parseSizeParam(undefined)).toBe(PaginationConfig.defaultSize);
  });

  it('honors an explicit fallback override', () => {
    expect(parseSizeParam('abc', 42)).toBe(42);
  });
});

describe('parseOrderParam', () => {
  it('accepts "asc" and "desc"', () => {
    expect(parseOrderParam('asc')).toBe('asc');
    expect(parseOrderParam('desc')).toBe('desc');
  });

  it('falls back to "asc" by default for any other value', () => {
    expect(parseOrderParam('invalid')).toBe('asc');
    expect(parseOrderParam(undefined)).toBe('asc');
  });

  it('honors an explicit fallback override', () => {
    expect(parseOrderParam('invalid', 'desc')).toBe('desc');
  });
});
