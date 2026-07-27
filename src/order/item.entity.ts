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

  /** unitPrice * quantity — calculado, nunca persistido separadamente. */
  subtotal(): string {
    return (Number(this.unitPrice) * this.quantity).toFixed(2);
  }
}
