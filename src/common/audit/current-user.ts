import { AsyncLocalStorage } from 'node:async_hooks';

export interface CurrentUserContext {
  username: string;
  roles: string[];
}

/**
 * Resolve o usuário autenticado fora do ciclo request/response do Nest
 * (ex. dentro de um TypeORM subscriber, que não tem acesso ao `Request`).
 * O `CurrentUserInterceptor` grava o valor no início de cada requisição
 * (depois dos guards, quando `req.user` já foi populado pelo Passport);
 * ausência de store cobre jobs internos e testes sem requisição HTTP,
 * que são tratados como contexto de sistema (ownership não se aplica).
 */
export const currentUserStorage = new AsyncLocalStorage<CurrentUserContext>();

export function currentUsername(): string {
  return currentUserStorage.getStore()?.username ?? 'system';
}

export function currentUserRoles(): string[] {
  return currentUserStorage.getStore()?.roles ?? [];
}

export function isCurrentUserAdmin(): boolean {
  return currentUserRoles().includes('ROLE_ADMIN');
}

/** true fora de uma requisição HTTP autenticada (jobs internos, testes). */
export function isSystemContext(): boolean {
  return currentUserStorage.getStore() === undefined;
}
