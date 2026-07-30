import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

/**
 * Fluxo completo via HTTP contra um Postgres real (Testcontainers): cria
 * cliente/pedido, percorre a máquina de estados, e valida RBAC + ownership
 * fim a fim (não apenas mockado como nos specs unitários dos services).
 */
describe('Order flow (e2e)', () => {
  jest.setTimeout(120_000);

  let container: StartedTestContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let jwtService: JwtService;
  let privateKey: string;
  let tmpDir: string;

  let adminToken: string;
  let userToken: string;
  let otherUserToken: string;

  function tokenFor(username: string, roles: string[]): string {
    return jwtService.sign(
      { preferred_username: username, realm_access: { roles } },
      { algorithm: 'RS256', privateKey, audience: 'nest-order-api', subject: username, expiresIn: '1h' },
    );
  }

  beforeAll(async () => {
    const { privateKey: priv, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = priv;
    tmpDir = mkdtempSync(join(tmpdir(), 'nest-order-api-jwt-'));
    const publicKeyPath = join(tmpDir, 'public.pem');
    writeFileSync(publicKeyPath, publicKey);

    // Reaper (Ryuk) fica pendurado neste Docker Desktop/Windows; container
    // é descartado explicitamente no afterAll, então o auto-cleanup não faz falta.
    process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

    container = await new GenericContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'nest_order_api_test' })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();

    // container.getHost() retorna "localhost", que resolve para ::1 neste
    // ambiente e derruba a conexão (ECONNRESET); 127.0.0.1 explícito evita isso.
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
    const { GlobalExceptionFilter } = await import('../src/common/exceptions/global-exception.filter');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    jwtService = new JwtService({});
    adminToken = tokenFor('admin-user', ['ROLE_ADMIN']);
    userToken = tokenFor('alice', ['ROLE_USER']);
    otherUserToken = tokenFor('bob', ['ROLE_USER']);
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createCustomerPayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: 'Alice Customer',
      taxId: `TAX-${Date.now()}`,
      email: 'alice.customer@example.com',
      ...overrides,
    };
  }

  it('rejects requests without a bearer token', async () => {
    await request(app.getHttpServer()).get('/orders/00000000-0000-0000-0000-000000000000').expect(401);
  });

  it('rejects a USER trying to create a customer (ADMIN only)', async () => {
    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${userToken}`)
      .send(createCustomerPayload())
      .expect(403);
  });

  let customerId: string;

  it('creates a customer as ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createCustomerPayload())
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Alice Customer');
    customerId = res.body.id;
  });

  it('rejects creating a second customer with a duplicate taxId', async () => {
    const first = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createCustomerPayload({ taxId: 'DUPLICATE-TAX-1', email: 'first@example.com' }))
      .expect(201);

    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createCustomerPayload({ taxId: 'DUPLICATE-TAX-1', email: 'second@example.com' }))
      .expect(409);

    expect(first.body.id).toBeDefined();
  });

  let orderId: string;

  it('creates an order as USER with an initial item and computes the total', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ customerId, items: [{ description: 'Widget', unitPrice: 10, quantity: 2 }] })
      .expect(201);

    expect(res.body.status).toBe('OPEN');
    expect(res.body.total).toBe('20.00');
    orderId = res.body.id;
  });

  it('adds an item to the order and recalculates the total', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ description: 'Gadget', unitPrice: 5, quantity: 1 })
      .expect(201);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe('25.00');
  });

  it('hides the order from another non-admin user as a 404 (ownership)', async () => {
    await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(404);
  });

  it('allows the owning user to read their own order', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
  });

  it('allows an admin to read an order owned by someone else', async () => {
    await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('rejects a USER trying to confirm the order (ADMIN only)', async () => {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('confirms the order as ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(res.body.status).toBe('CONFIRMED');
  });

  it('rejects adding items once the order is confirmed', async () => {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ description: 'Too late', unitPrice: 1, quantity: 1 })
      .expect(400);
  });

  it('cancels the confirmed order as ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(res.body.status).toBe('CANCELED');
  });

  it('rejects cancelling an already-canceled order (invalid transition)', async () => {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('rejects confirming an order with no items', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ customerId, items: [] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
