import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { AuditableBaseEntity } from './auditable.base-entity';
import { currentUsername } from './current-user';

/**
 * Equivalente ao AuditorAware<String> do projeto Java: preenche
 * createdBy/updatedBy automaticamente em todo insert/update de entidade
 * que estenda AuditableBaseEntity, sem repetir a lógica domínio a domínio.
 */
@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<unknown>): void {
    if (!(event.entity instanceof AuditableBaseEntity)) {
      return;
    }
    const username = currentUsername();
    event.entity.createdBy = username;
    event.entity.updatedBy = username;
  }

  beforeUpdate(event: UpdateEvent<unknown>): void {
    if (!event.entity || !(event.entity instanceof AuditableBaseEntity)) {
      return;
    }
    event.entity.updatedBy = currentUsername();
  }
}
