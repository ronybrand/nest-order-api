import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { databaseConnectionConfig } from './database-connection.config';

export const typeOrmConfig: TypeOrmModuleOptions = {
  ...databaseConnectionConfig,
  // Migrations controlam o schema em todo ambiente (dev incluso) - nunca
  // confie em synchronize para não divergir do que roda em produção.
  synchronize: false,
  migrations: ['dist/database/migrations/*.js'],
  migrationsRun: false,
};
