import { envConfig } from './env.config';

describe('envConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // CORS_ALLOWED_ORIGINS e obrigatorio (fail-fast) - default valido para os
    // testes que nao exercitam esse comportamento especificamente.
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns default pagination and rate-limit values when env vars are unset', () => {
    delete process.env.PAGINATION_DEFAULT_PAGE;
    delete process.env.PAGINATION_DEFAULT_SIZE;
    delete process.env.PAGINATION_MAX_SIZE;
    delete process.env.RATE_LIMIT_POINTS;
    delete process.env.RATE_LIMIT_DURATION_SECONDS;
    delete process.env.TRUSTED_PROXIES;

    const config = envConfig();

    expect(config.pagination).toEqual({ defaultPage: 0, defaultSize: 20, maxSize: 100 });
    expect(config.rateLimit).toEqual({ points: 100, duration: 60 });
    expect(config.trustedProxies).toEqual([]);
  });

  it('parses a comma-separated TRUSTED_PROXIES into a trimmed array', () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1, 10.0.0.2 ,172.16.0.0/12';

    const config = envConfig();

    expect(config.trustedProxies).toEqual(['10.0.0.1', '10.0.0.2', '172.16.0.0/12']);
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

  it('parses a comma-separated CORS_ALLOWED_ORIGINS into a trimmed array', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000, https://example.com ,https://foo.com';

    const config = envConfig();

    expect(config.cors.allowedOrigins).toEqual(['http://localhost:3000', 'https://example.com', 'https://foo.com']);
  });

  it('fails fast when CORS_ALLOWED_ORIGINS is unset', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;

    expect(() => envConfig()).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('fails fast when CORS_ALLOWED_ORIGINS is empty/blank', () => {
    process.env.CORS_ALLOWED_ORIGINS = '  , ,';

    expect(() => envConfig()).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  describe('messaging configuration', () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
      delete process.env.RABBITMQ_URL;
      delete process.env.SMTP_STARTTLS;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;
    });

    it('keeps the local broker default and plain local SMTP in development', () => {
      const config = envConfig();

      expect(config.rabbitmq.url).toBe('amqp://guest:guest@localhost:5672');
      expect(config.smtp).toMatchObject({ host: 'localhost', port: 1025, starttls: false });
      expect(config.smtp.user).toBeUndefined();
    });

    it('refuses to fall back to guest credentials in production', () => {
      process.env.NODE_ENV = 'production';

      expect(() => envConfig()).toThrow(/RABBITMQ_URL/);
    });

    it('requires TLS (amqps) to the broker in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.RABBITMQ_URL = 'amqp://svc:secret@broker:5672';
      process.env.SMTP_STARTTLS = 'true';

      expect(() => envConfig()).toThrow(/amqps/);
    });

    it('treats any unknown NODE_ENV as production', () => {
      process.env.NODE_ENV = 'staging';

      expect(() => envConfig()).toThrow(/RABBITMQ_URL/);
    });

    it('requires STARTTLS for SMTP in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.RABBITMQ_URL = 'amqps://svc:secret@broker:5671';

      expect(() => envConfig()).toThrow(/SMTP_STARTTLS/);
    });

    it('never allows SMTP credentials over a plain connection, in any environment', () => {
      process.env.SMTP_USER = 'mailer';
      process.env.SMTP_PASSWORD = 'secret';

      expect(() => envConfig()).toThrow(/SMTP_STARTTLS/);
    });

    it('accepts a fully secured production setup', () => {
      process.env.NODE_ENV = 'production';
      process.env.RABBITMQ_URL = 'amqps://svc:secret@broker:5671';
      process.env.SMTP_STARTTLS = 'true';
      process.env.SMTP_USER = 'mailer';
      process.env.SMTP_PASSWORD = 'secret';
      process.env.SMTP_PORT = '587';

      const config = envConfig();

      expect(config.rabbitmq.url).toBe('amqps://svc:secret@broker:5671');
      expect(config.smtp).toMatchObject({ starttls: true, user: 'mailer', password: 'secret', port: 587 });
    });
  });
});
