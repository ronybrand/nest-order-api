import Decimal from 'decimal.js';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from './order.entity';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 19, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'int' })
  quantity!: number;

  /**
   * unitPrice * quantity — calculado, nunca persistido separadamente. Ver o comentário em
   * `Order#calculateTotal` sobre os cuidados com decimal.js (construção a partir de string,
   * divisão nunca lançando exceção, `Decimal.set` global) antes de estender esta conta.
   */
  subtotal(): string {
    return new Decimal(this.unitPrice).times(this.quantity).toFixed(2);
  }
}
