import { SetMetadata } from '@nestjs/common';
import { Role } from './role.enum';

export const ROLES_KEY = 'roles';

/**
 * Granularidade autenticado-vs-admin é o padrão deste projeto (espelha o
 * java-order-api de referência) - nunca escreva a checagem de papel inline
 * no controller, sempre via este decorator + RolesGuard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
