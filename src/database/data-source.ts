import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseConnectionConfig } from './database-connection.config';

/** Usado apenas pela CLI do TypeORM (migration:generate/run/revert). */
export const AppDataSource = new DataSource({
  ...databaseConnectionConfig,
  migrations: ['src/database/migrations/*.ts'],
});
