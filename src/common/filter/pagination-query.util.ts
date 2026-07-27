import { PaginationConfig } from '../config/pagination.config';

/** Converte um valor de query string para inteiro não-negativo, com fallback seguro. */
export function parsePageParam(value: unknown, fallback = PaginationConfig.defaultPage): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Converte um valor de query string para tamanho de página válido, com fallback seguro. */
export function parseSizeParam(value: unknown, fallback = PaginationConfig.defaultSize): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

/** Valida `order` vindo de query string, com fallback seguro. */
export function parseOrderParam(value: unknown, fallback: 'asc' | 'desc' = 'asc'): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback;
}
