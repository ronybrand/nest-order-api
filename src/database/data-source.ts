import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Customer } from '../customer/customer.entity';
import { Order } from '../order/order.entity';
import { Item } from '../order/item.entity';

/** Usado apenas pela CLI do TypeORM (migration:generate/run/revert). */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'nest_order_api',
  entities: [Customer, Order, Item],
  migrations: ['src/database/migrations/*.ts'],
});
