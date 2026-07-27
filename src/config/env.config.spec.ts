import { envConfig } from './env.config';

describe('envConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns default pagination and rate-limit values when env vars are unset', () => {
    delete process.env.PAGINATION_DEFAULT_PAGE;
    delete process.env.PAGINATION_DEFAULT_SIZE;
    delete process.env.PAGINATION_MAX_SIZE;
    delete process.env.RATE_LIMIT_POINTS;
    delete process.env.RATE_LIMIT_DURATION_SECONDS;

    const config = envConfig();

    expect(config.pagination).toEqual({ defaultPage: 0, defaultSize: 20, maxSize: 100 });
    expect(config.rateLimit).toEqual({ points: 100, duration: 60 });
  });

  it('parses overridden env vars into typed numbers', () => {
    process.env.PAGINATION_DEFAULT_PAGE = '1';
    process.env.PAGINATION_DEFAULT_SIZE = '50';
    process.env.PAGINATION_MAX_SIZE = '200';
    process.env.RATE_LIMIT_POINTS = '10';
    process.env.RATE_LIMIT_DURATION_SECONDS = '5';

    const config = envConfig();

    expect(config.pagination).toEqual({ defaultPage: 1, defaultSize: 50, maxSize: 200 });
    expect(config.rateLimit).toEqual({ points: 10, duration: 5 });
  });
});
