import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
}

/**
 * Store separado do `currentUserStorage` (audit/current-user.ts): esse
 * precisa estar disponivel para TODA requisicao, inclusive as rejeitadas
 * pelos guards de autenticacao/autorizacao (401/403), entao e populado no
 * middleware do Express, antes do pipeline de guards do Nest rodar - nao
 * dentro de um interceptor, que so roda depois dos guards.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
