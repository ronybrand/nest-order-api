import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Found by the new `migration` CI drift check (compares `migration:generate` output against
 * the applied schema): `InitialSchema` (hand-written, not TypeORM-generated) never matched what
 * the entities actually declare. Most of this is cosmetic (auto-generated FK/index names vs the
 * hand-written ones, `version`'s DB-level DEFAULT that TypeORM doesn't expect since it always
 * sets the value itself), but one part is a real bug: `uq_customers_tax_id`/
 * `uq_customers_passport_number` were plain unique indexes, not the partial
 * (`WHERE "deleted_at" IS NULL`) ones `Customer`'s `@Index(...)` decorators declare - a
 * soft-deleted customer's `taxId`/`passportNumber` permanently blocked reuse by a new customer,
 * contradicting the documented business rule (DOMAIN.md §4.7) that only active records count
 * toward uniqueness.
 */
export class AlignSchemaWithEntities1789773004833 implements MigrationInterface {
    name = 'AlignSchemaWithEntities1789773004833'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "items_order_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey"`);
        await queryRunner.query(`DROP INDEX "public"."uq_customers_tax_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_customers_passport_number"`);
        await queryRunner.query(`DROP INDEX "public"."ix_items_order_id"`);
        await queryRunner.query(`DROP INDEX "public"."ix_orders_customer_id"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "version" DROP DEFAULT`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_051f9a61a9e9ff865bd6fea913" ON "customers"  ("passport_number") WHERE "deleted_at" IS NULL AND "passport_number" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_864977b5b8f9d5f332f3202f76" ON "customers"  ("tax_id") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "items" ADD CONSTRAINT "FK_f3dcaa16e13ff84a647c6410e15" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`);
        await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "FK_f3dcaa16e13ff84a647c6410e15"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_864977b5b8f9d5f332f3202f76"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_051f9a61a9e9ff865bd6fea913"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "version" SET DEFAULT '1'`);
        await queryRunner.query(`CREATE INDEX "ix_orders_customer_id" ON "orders" USING btree ("customer_id") `);
        await queryRunner.query(`CREATE INDEX "ix_items_order_id" ON "items" USING btree ("order_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_customers_passport_number" ON "customers" USING btree ("passport_number") WHERE ((deleted_at IS NULL) AND (passport_number IS NOT NULL))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_customers_tax_id" ON "customers" USING btree ("tax_id") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "items" ADD CONSTRAINT "items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
