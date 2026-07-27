import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { VersionedAuditableBaseEntity } from '../common/audit/auditable.base-entity';
import { Customer } from '../customer/customer.entity';
import { Item } from './item.entity';
import { OrderStatus } from './order-status.enum';

@Entity('orders')
export class Order extends VersionedAuditableBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Customer, { eager: true, nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @OneToMany(() => Item, (item) => item.order, { cascade: true, eager: true })
  items!: Item[];

  @Column({ type: 'decimal', precision: 19, scale: 2, default: 0 })
  total!: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.OPEN })
  status!: OrderStatus;

  /** total = Σ (item.unitPrice * item.quantity). Chame após qualquer mutação de itens. */
  calculateTotal(): void {
    const sum = (this.items ?? []).reduce((acc, item) => acc + Number(item.unitPrice) * item.quantity, 0);
    this.total = sum.toFixed(2);
  }

  isEditable(): boolean {
    return this.status === OrderStatus.OPEN;
  }
}
