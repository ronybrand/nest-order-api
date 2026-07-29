import Decimal from 'decimal.js';
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

  /**
   * total = Σ (item.unitPrice * item.quantity). Chame após qualquer mutação de itens.
   *
   * Decimal.js aqui evita o mesmo problema que `java.math.BigDecimal` resolve no serviço
   * Java irmão deste domínio, mas com comportamento diferente em dois pontos que já
   * pegaram gente de surpresa em outras linguagens — vale manter a leitura ao tocar neste
   * código:
   *
   * 1. Construir a partir de `string`, nunca de `number`: `unitPrice`/`total` são `string`
   *    de ponta a ponta (coluna `decimal`), então `new Decimal(this.unitPrice)` nunca vê um
   *    float. Se um dia um valor monetário chegar como `number` (ex.: vindo de outro
   *    serviço), não faça `new Decimal(valorFloat)` — apesar do decimal.js (diferente do
   *    `new BigDecimal(double)` do Java, e diferente do `Decimal(float)` do Python) já
   *    converter `number` pela representação decimal mais curta (não pelos bits binários
   *    exatos), a forma segura e explícita é sempre converter para string antes.
   *
   * 2. Divisão nunca lança exceção aqui: ao contrário de `BigDecimal.divide` do Java (que
   *    lança `ArithmeticException` numa dízima periódica sem `RoundingMode` explícito),
   *    `Decimal#dividedBy` do decimal.js — assim como `Decimal / Decimal` do Python — nunca
   *    lança; ele arredonda silenciosamente para `Decimal.precision` (20 dígitos
   *    significativos por padrão) usando `Decimal.rounding` (ROUND_HALF_UP por padrão). Se
   *    este domínio um dia precisar dividir dinheiro (rateio, desconto proporcional etc.),
   *    encadeie sempre um arredondamento explícito para 2 casas, ex.:
   *    `a.dividedBy(b).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)` — nunca confie no
   *    default de 20 dígitos chegando até a coluna `decimal(19,2)`.
   *    Nunca chame `Decimal.set(...)` para mudar precisão/rounding: isso muta o construtor
   *    global compartilhado por todo import de decimal.js no processo. Se algum caso
   *    precisar de config diferente, use `Decimal.clone({...})` para um construtor isolado.
   */
  calculateTotal(): void {
    const sum = (this.items ?? []).reduce(
      (acc, item) => acc.plus(new Decimal(item.unitPrice).times(item.quantity)),
      new Decimal(0),
    );
    this.total = sum.toFixed(2);
  }

  isEditable(): boolean {
    return this.status === OrderStatus.OPEN;
  }
}
