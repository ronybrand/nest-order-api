import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditableBaseEntity } from '../common/audit/auditable.base-entity';
import { Sensitive } from '../common/security/sensitive.decorator';

@Entity('customers')
@Index(['taxId'], { unique: true, where: '"deleted_at" IS NULL' })
@Index(['passportNumber'], { unique: true, where: '"deleted_at" IS NULL AND "passport_number" IS NOT NULL' })
export class Customer extends AuditableBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'tax_id', type: 'varchar', length: 20 })
  @Sensitive()
  taxId!: string;

  @Column({ name: 'passport_number', type: 'varchar', length: 9, nullable: true })
  @Sensitive()
  passportNumber?: string | null;

  @Column({ type: 'varchar', length: 255 })
  @Sensitive()
  email!: string;
}
