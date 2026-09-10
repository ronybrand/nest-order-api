import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { configureApp } from './configure-app';
import { envConfig } from '../config/env.config';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [envConfig] })] })
class TestModule {}

describe('configureApp - trust proxy', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function buildApp(): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return app;
  }

  it('does not trust X-Forwarded-For when TRUSTED_PROXIES is unset (safe default)', async () => {
    delete process.env.TRUSTED_PROXIES;

    const app = await buildApp();
    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(false);
    await app.close();
  });

  it('trusts only the configured proxy allowlist when TRUSTED_PROXIES is set', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.1, 172.16.0.0/12';

    const app = await buildApp();
    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toEqual(['10.0.0.1', '172.16.0.0/12']);
    await app.close();
  });
});
