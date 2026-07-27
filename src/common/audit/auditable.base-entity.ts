import { CreateDateColumn, Column, UpdateDateColumn, VersionColumn } from 'typeorm';

/**
 * Colunas de auditoria + soft delete compartilhadas por todo agregado.
 * `createdBy`/`updatedBy`/`deletedBy` são preenchidos pelo `AuditSubscriber`
 * (src/common/audit/audit.subscriber.ts) a partir do usuário autenticado -
 * nunca setados manualmente no service.
 */
export abstract class AuditableBaseEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'varchar' })
  updatedBy!: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @Column({ name: 'deleted_by', type: 'varchar', nullable: true })
  deletedBy?: string | null;
}

/**
 * Entidade sujeita a concorrência real (ex. Order: status e itens mutados
 * entre requisições). Entidades de referência puras não precisam disso -
 * veja o checklist na skill nest-feature.
 */
export abstract class VersionedAuditableBaseEntity extends AuditableBaseEntity {
  @VersionColumn({ name: 'version' })
  version!: number;
}
