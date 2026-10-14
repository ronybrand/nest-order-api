import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `Customer` ganhou `@VersionColumn` (via VersionedAuditableBaseEntity): dois PUT concorrentes no mesmo
 * cliente deixam de sobrescrever um ao outro em silencio (o segundo recebe 409). Linhas existentes comecam
 * em 1; o DEFAULT e removido em seguida porque o TypeORM sempre informa o valor, e o check de drift do CI
 * compara o esquema com o que a entidade declara.
 */
export class AddCustomerVersion1789773004834 implements MigrationInterface {
    name = 'AddCustomerVersion1789773004834'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customers" ADD "version" integer NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "version" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "version"`);
    }
}
