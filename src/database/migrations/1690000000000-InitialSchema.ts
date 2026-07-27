import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1690000000000 implements MigrationInterface {
  name = 'InitialSchema1690000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "tax_id" varchar(20) NOT NULL,
        "passport_number" varchar(9),
        "email" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" varchar NOT NULL,
        "updated_by" varchar NOT NULL,
        "deleted_at" timestamptz,
        "deleted_by" varchar
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_tax_id" ON "customers" ("tax_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_passport_number" ON "customers" ("passport_number") ` +
        `WHERE "deleted_at" IS NULL AND "passport_number" IS NOT NULL`,
    );

    await queryRunner.query(`CREATE TYPE "orders_status_enum" AS ENUM ('OPEN', 'CONFIRMED', 'CANCELED')`);
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL REFERENCES "customers" ("id"),
        "total" decimal(19,2) NOT NULL DEFAULT 0,
        "status" "orders_status_enum" NOT NULL DEFAULT 'OPEN',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" varchar NOT NULL,
        "updated_by" varchar NOT NULL,
        "deleted_at" timestamptz,
        "deleted_by" varchar
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_orders_customer_id" ON "orders" ("customer_id")`);

    await queryRunner.query(`
      CREATE TABLE "items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders" ("id") ON DELETE CASCADE,
        "description" varchar(255) NOT NULL,
        "unit_price" decimal(19,2) NOT NULL,
        "quantity" integer NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_items_order_id" ON "items" ("order_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
