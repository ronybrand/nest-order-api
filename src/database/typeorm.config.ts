import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Customer } from '../customer/customer.entity';
import { Order } from '../order/order.entity';
import { Item } from '../order/item.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'nest_order_api',
  entities: [Customer, Order, Item],
  // Migrations controlam o schema em todo ambiente (dev incluso) - nunca
  // confie em synchronize para não divergir do que roda em produção.
  synchronize: false,
  migrations: ['dist/database/migrations/*.js'],
  migrationsRun: false,
};
