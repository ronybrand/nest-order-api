import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from './role.enum';
import { ROLES_KEY } from './roles.decorator';

interface AuthenticatedRequest extends Request {
  user?: { username: string; roles: string[] };
}

/**
 * Resolve autenticação (via JwtAuthGuard, aplicado antes deste) e papel.
 * NÃO resolve ownership de recurso - isso é responsabilidade do service,
 * ver checklist na skill nest-feature.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = request.user?.roles ?? [];
    const authorized = requiredRoles.some((role) => userRoles.includes(role));
    if (!authorized) {
      throw new ForbiddenException('Access denied');
    }
    return true;
  }
}
