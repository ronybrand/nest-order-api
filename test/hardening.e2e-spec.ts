import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

/**
 * Cobre o wiring de `configureApp` (Helmet, tamanho maximo de request, CORS)
 * ponta a ponta via HTTP real - o spec de fluxo de pedido (order-flow) nao
 * chama `configureApp`, entao nao prova nada sobre esse hardening.
 */
describe('Hardening (e2e)', () => {
  jest.setTimeout(120_000);

  let container: StartedTestContainer;
  let dataSource: DataSource;
  let app: NestExpressApplication;
  let tmpDir: string;

  beforeAll(async () => {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    tmpDir = mkdtempSync(join(tmpdir(), 'nest-order-api-hardening-'));
    const publicKeyPath = join(tmpDir, 'public.pem');
    writeFileSync(publicKeyPath, publicKey);

    process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

    container = await new GenericContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'nest_order_api_test' })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();

    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = 'test';
    process.env.DB_PASSWORD = 'test';
    process.env.DB_DATABASE = 'nest_order_api_test';
    process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
    process.env.JWT_AUDIENCE = 'nest-order-api';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

    const { InitialSchema1690000000000 } = await import(
      '../src/database/migrations/1690000000000-InitialSchema'
    );
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      migrations: [InitialSchema1690000000000],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap/configure-app');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects a request body over 1MB with 413, before any auth check runs', async () => {
    const oversizedPayload = { name: 'a'.repeat(2_000_000) };

    await request(app.getHttpServer())
      // Sem Authorization header de proposito: o corpo estourado deve ser
      // rejeitado pelo body parser antes mesmo de chegar nos guards.
      .post('/customers')
      .send(oversizedPayload)
      .expect(413);
  });

  it('accepts a request body comfortably under the 1MB limit (reaches auth, not body-size)', async () => {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .send({ name: 'Alice', taxId: `TAX-${Date.now()}`, email: 'alice@example.com' });

    // Sem token: deve falhar por auth (401), nao por tamanho de corpo (413).
    expect(res.status).toBe(401);
  });

  it('sets hardened Helmet headers on every response', async () => {
    const res = await request(app.getHttpServer()).get('/customers/00000000-0000-0000-0000-000000000000');

    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('propagates x-request-id into the error response body via the global exception filter', async () => {
    const res = await request(app.getHttpServer())
      .get('/customers/00000000-0000-0000-0000-000000000000')
      .set('x-request-id', 'e2e-fixed-request-id');

    expect(res.headers['x-request-id']).toBe('e2e-fixed-request-id');
    expect(res.body.requestId).toBe('e2e-fixed-request-id');
  });
});
