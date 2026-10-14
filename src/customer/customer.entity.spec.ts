import { getMetadataArgsStorage } from 'typeorm';
import { VersionedAuditableBaseEntity } from '../common/audit/auditable.base-entity';
import { Customer } from './customer.entity';

describe('Customer entity', () => {
  it('is versioned, so two concurrent updates cannot silently overwrite each other', () => {
    const versionColumn = getMetadataArgsStorage().columns.find(
      (column) => column.target === VersionedAuditableBaseEntity && column.propertyName === 'version',
    );

    expect(Object.getPrototypeOf(Customer)).toBe(VersionedAuditableBaseEntity);
    expect(versionColumn?.mode).toBe('version');
  });
});
