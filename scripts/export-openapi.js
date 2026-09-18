'use strict';

// Generates a static snapshot of the OpenAPI spec from the *compiled* app
// (dist/, built with the @nestjs/swagger CLI plugin enabled in nest-cli.json
// - only `nest build` runs that transform, ts-jest does not, so this reads
// dist/ rather than compiling src/ itself; run `npm run build` first).
//
// There is no live deployment of this API to browse Swagger UI on, and none
// is added here either - SwaggerModule.createDocument() only introspects the
// app's route metadata in-process, no HTTP endpoint is ever exposed. Postgres
// is still required because TypeORM connects eagerly at bootstrap (same
// Testcontainers approach as test/order-flow.e2e-spec.ts); RabbitMQ/SMTP are
// not (both connect lazily/in the background - see
// src/notification/amqp-connection-manager.ts and rabbitmq.consumer.ts), so
// only Postgres needs a real container here.

require('reflect-metadata');
const { generateKeyPairSync } = require('node:crypto');
const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { GenericContainer, Wait } = require('testcontainers');
const { DataSource } = require('typeorm');
const { Test } = require('@nestjs/testing');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');

const OUTPUT_PATH = join(__dirname, '..', 'dist-openapi', 'openapi.json');

async function main() {
  process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const tmpDir = mkdtempSync(join(tmpdir(), 'nest-order-api-openapi-'));
  const publicKeyPath = join(tmpDir, 'public.pem');
  writeFileSync(publicKeyPath, publicKey);

  const container = await new GenericContainer('postgres:16-alpine')
    .withExposedPorts(5432)
    .withEnvironment({ POSTGRES_USER: 'docs', POSTGRES_PASSWORD: 'docs', POSTGRES_DB: 'nest_order_api_docs' })
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(container.getMappedPort(5432));
  process.env.DB_USERNAME = 'docs';
  process.env.DB_PASSWORD = 'docs';
  process.env.DB_DATABASE = 'nest_order_api_docs';
  process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
  process.env.JWT_AUDIENCE = 'nest-order-api';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5672';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'docs@example.com';

  const { InitialSchema1690000000000 } = require('../dist/database/migrations/1690000000000-InitialSchema');
  const dataSource = new DataSource({
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

  const { AppModule } = require('../dist/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('nest-order-api')
    .setDescription(
      'Order management domain (Customer -> Order -> Item) - NestJS + TypeORM + PostgreSQL port of spring-order-api. ' +
        'Static snapshot generated at build time; there is no live instance of this API.',
    )
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  mkdirSync(join(__dirname, '..', 'dist-openapi'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(document));

  await app.close();
  await dataSource.destroy();
  await container.stop();
  rmSync(tmpDir, { recursive: true, force: true });

  console.log(`OpenAPI spec written to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
