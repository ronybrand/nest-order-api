import { ErrorCode } from '../exceptions/error-code.enum';
import { InvalidInputException } from '../exceptions/domain.exception';

/** O que o motor de busca precisa saber de uma coluna (subconjunto de ColumnMetadata do TypeORM). */
export interface FilterableColumn {
  propertyName: string;
  type?: unknown;
  enum?: unknown[];
}

export type ColumnKind = 'uuid' | 'integer' | 'decimal' | 'boolean' | 'datetime' | 'enum' | 'text';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^-?\d+$/;
const DIGITS = /^\d+$/;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const ISO_DATE_CHARS = /^[0-9TZ:.+\- ]+$/;

const INTEGER_TYPES = new Set(['int', 'integer', 'smallint', 'bigint', 'int2', 'int4', 'int8']);
const DECIMAL_TYPES = new Set(['decimal', 'numeric', 'float', 'double', 'double precision', 'real', 'float4', 'float8']);
const BOOLEAN_TYPES = new Set(['boolean', 'bool']);
const DATE_TYPES = new Set(['date', 'timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone']);

export function kindOf(column: FilterableColumn): ColumnKind {
  if (column.enum && column.enum.length > 0) {
    return 'enum';
  }
  const type = column.type;
  if (typeof type === 'function') {
    if (type === Number) return 'decimal';
    if (type === Boolean) return 'boolean';
    if (type === Date) return 'datetime';
    return 'text';
  }
  const name = String(type ?? 'varchar').toLowerCase();
  if (name === 'uuid') return 'uuid';
  if (INTEGER_TYPES.has(name)) return 'integer';
  if (DECIMAL_TYPES.has(name)) return 'decimal';
  if (BOOLEAN_TYPES.has(name)) return 'boolean';
  if (DATE_TYPES.has(name)) return 'datetime';
  return 'text';
}

/** -12, 10.50: sinal opcional, digitos, e no maximo uma parte decimal (sem expoente, NaN, Infinity, virgula). */
function isPlainDecimal(raw: string): boolean {
  const unsigned = raw.startsWith('-') ? raw.slice(1) : raw;
  const [whole, fraction, ...rest] = unsigned.split('.');
  return rest.length === 0 && DIGITS.test(whole) && (fraction === undefined || DIGITS.test(fraction));
}

function isIsoDate(raw: string): boolean {
  return raw.length <= 40 && ISO_DATE_PREFIX.test(raw) && ISO_DATE_CHARS.test(raw) && !Number.isNaN(Date.parse(raw));
}

function invalid(column: FilterableColumn): never {
  // O valor enviado nunca volta na resposta: o campo pode ser sensivel (taxId, email...).
  throw new InvalidInputException(
    ErrorCode.VALIDATION_INVALID_FILTER_VALUE,
    `Invalid value for field: ${column.propertyName}`,
    { field: column.propertyName },
  );
}

/**
 * Converte o texto vindo da query string para o tipo da coluna, estritamente. Sem isso o valor ia cru
 * para o Postgres e um UUID/numero/data invalido virava erro de banco (500) em vez de 400.
 */
export function coerceFilterValue(column: FilterableColumn, raw: string): unknown {
  switch (kindOf(column)) {
    case 'uuid':
      return UUID.test(raw) ? raw.toLowerCase() : invalid(column);
    case 'integer': {
      const parsed = Number(raw);
      return INTEGER.test(raw) && Number.isSafeInteger(parsed) ? parsed : invalid(column);
    }
    case 'decimal':
      // Texto, nao Number: o Postgres compara numeric sem perder precisao. Sem NaN/Infinity/expoente.
      return isPlainDecimal(raw) ? raw : invalid(column);
    case 'boolean': {
      const lowered = raw.toLowerCase();
      if (lowered === 'true') return true;
      if (lowered === 'false') return false;
      return invalid(column);
    }
    case 'datetime':
      return isIsoDate(raw) ? raw : invalid(column);
    case 'enum':
      return column.enum!.includes(raw) ? raw : invalid(column);
    default:
      return raw;
  }
}
