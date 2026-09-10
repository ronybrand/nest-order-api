import { FindOptionsWhere, ObjectLiteral, QueryDeepPartialEntity, Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { AuditableBaseEntity } from '../audit/auditable.base-entity';
import { currentUsername } from '../audit/current-user';
import { ErrorCode } from '../exceptions/error-code.enum';
import { ResourceNotFoundException } from '../exceptions/domain.exception';

type EntityWithId = { id: string };

/**
 * find-or-404 (respeitando soft-delete) + soft-delete, compartilhados pelos
 * services de domínio (CustomerService, OrderService) - os dois faziam a
 * mesma query/update copiados um do outro. `canAccess` é o único ponto de
 * extensão: OrderService sobrepõe para aplicar ownership sem duplicar a
 * query base (ver checklist de ownership em AGENTS.md).
 */
export abstract class AbstractCrudService<T extends AuditableBaseEntity & EntityWithId & ObjectLiteral> {
  protected constructor(
    protected readonly repository: Repository<T>,
    private readonly entityName: string,
    private readonly notFoundErrorCode: ErrorCode,
  ) {}

  protected async findEntityByIdOrThrow(id: string): Promise<T> {
    const where = { id, deletedAt: IsNull() } as unknown as FindOptionsWhere<T>;
    const entity = await this.repository.findOneBy(where);
    if (!entity || !this.canAccess(entity)) {
      throw new ResourceNotFoundException(this.notFoundErrorCode, `${this.entityName} ${id} not found`, { id });
    }
    return entity;
  }

  protected async softDelete(id: string): Promise<void> {
    const partial = { deletedAt: new Date(), deletedBy: currentUsername() } as unknown as QueryDeepPartialEntity<T>;
    await this.repository.update(id, partial);
  }

  /** Default permite tudo (ex. Customer, sem conceito de dono). */
  protected canAccess(_entity: T): boolean {
    return true;
  }
}
