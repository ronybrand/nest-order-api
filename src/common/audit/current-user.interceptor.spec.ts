import { of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { CurrentUserInterceptor } from './current-user.interceptor';
import { currentUsername, currentUserRoles, isSystemContext } from './current-user';

function buildContext(user?: { username?: string; roles?: string[] }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function buildCallHandler(captureDuringHandle: () => void): CallHandler {
  return {
    handle: () => {
      captureDuringHandle();
      return of('result');
    },
  };
}

describe('CurrentUserInterceptor', () => {
  let interceptor: CurrentUserInterceptor;

  beforeEach(() => {
    interceptor = new CurrentUserInterceptor();
  });

  it('populates the AsyncLocalStorage with the authenticated user for the duration of the request', (done) => {
    const context = buildContext({ username: 'alice', roles: ['ROLE_ADMIN'] });
    let capturedUsername: string | undefined;
    let capturedRoles: string[] | undefined;
    const handler = buildCallHandler(() => {
      capturedUsername = currentUsername();
      capturedRoles = currentUserRoles();
    });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(capturedUsername).toBe('alice');
      expect(capturedRoles).toEqual(['ROLE_ADMIN']);
      done();
    });
  });

  it('falls back to "system" and no roles when request.user is absent', (done) => {
    const context = buildContext(undefined);
    let capturedUsername: string | undefined;
    let capturedRoles: string[] | undefined;
    const handler = buildCallHandler(() => {
      capturedUsername = currentUsername();
      capturedRoles = currentUserRoles();
    });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(capturedUsername).toBe('system');
      expect(capturedRoles).toEqual([]);
      done();
    });
  });

  it('does not leak the store outside of the intercepted request', () => {
    const context = buildContext({ username: 'bob', roles: [] });
    const handler = buildCallHandler(() => undefined);

    expect(isSystemContext()).toBe(true);

    // of() emits synchronously, so subscribe() below fully drains the request
    // (including the AsyncLocalStorage.run callback) before returning here.
    interceptor.intercept(context, handler).subscribe();

    expect(isSystemContext()).toBe(true);
  });
});
