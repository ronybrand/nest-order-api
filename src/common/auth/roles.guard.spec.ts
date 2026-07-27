import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from './role.enum';

function mockContext(userRoles?: string[]): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRoles ? { username: 'alice', roles: userRoles } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when the handler has no @Roles requirement', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('allows access when the required roles array is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(mockContext(['ROLE_USER']))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(mockContext(['ROLE_ADMIN']))).toBe(true);
  });

  it('denies access when the user lacks any required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(mockContext(['ROLE_USER']))).toThrow(ForbiddenException);
  });

  it('denies access when there is no authenticated user on the request', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.USER]);

    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });
});
