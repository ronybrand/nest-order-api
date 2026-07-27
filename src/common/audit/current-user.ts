import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Resolve o usuário autenticado fora do ciclo request/response do Nest
 * (ex. dentro de um TypeORM subscriber, que não tem acesso ao `Request`).
 * O `CurrentUserMiddleware` grava o valor no início de cada requisição;
 * fallback "system" cobre jobs internos e testes sem requisição HTTP.
 */
export const currentUserStorage = new AsyncLocalStorage<string>();

export function currentUsername(): string {
  return currentUserStorage.getStore() ?? 'system';
}
