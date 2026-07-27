import { Customer } from '../customer/customer.entity';
import { Order } from '../order/order.entity';
import { Item } from '../order/item.entity';

/** Opções de conexão compartilhadas entre o runtime da app (typeorm.config.ts) e a CLI de migration (data-source.ts). */
export const databaseConnectionConfig = {
  type: 'postgres' as const,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'nest_order_api',
  entities: [Customer, Order, Item],
};
