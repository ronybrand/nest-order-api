import 'reflect-metadata';

const SENSITIVE_FIELDS_KEY = 'sensitive:fields';

/**
 * Nomes de campo (não amarrados a uma classe específica) já vistos em algum
 * `@Sensitive()`. Alimenta `maskSensitiveDeep()`, que mascara por nome de
 * chave em qualquer objeto (ex. `params` de uma exceção de domínio) sem
 * precisar da instância/classe original — ver GlobalExceptionFilter.
 */
const globalSensitiveFieldNames = new Set<string>();

/**
 * Marca um campo de entidade/DTO como PII (LGPD/GDPR) — nunca deve
 * aparecer em log, toString/console ou serialização de erro em texto claro.
 * Infra central única: anote o campo, o mascaramento é automático via
 * `maskSensitive()`/`maskSensitiveDeep()`. Não crie exclusão manual por classe.
 */
export function Sensitive(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: (string | symbol)[] = Reflect.getMetadata(SENSITIVE_FIELDS_KEY, target.constructor) ?? [];
    Reflect.defineMetadata(SENSITIVE_FIELDS_KEY, [...existing, propertyKey], target.constructor);
    globalSensitiveFieldNames.add(String(propertyKey));
  };
}

export function sensitiveFieldsOf(target: object): (string | symbol)[] {
  return Reflect.getMetadata(SENSITIVE_FIELDS_KEY, target.constructor) ?? [];
}

/**
 * Retorna uma cópia rasa do objeto com todo campo `@Sensitive` substituído
 * por `***`. Use antes de logar uma entidade/DTO — nunca logue o objeto
 * original diretamente.
 */
export function maskSensitive<T extends object>(instance: T): Record<string, unknown> {
  const sensitiveFields = new Set(sensitiveFieldsOf(instance).map(String));
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(instance)) {
    masked[key] = sensitiveFields.has(key) && value != null ? '***' : value;
  }
  return masked;
}

/**
 * Mascara recursivamente qualquer chave já registrada por `@Sensitive()`,
 * em qualquer nível de um objeto/array arbitrário — sem exigir a classe da
 * entidade original. Único ponto usado pelo GlobalExceptionFilter para
 * sanitizar `params` de exceção antes de serializar para o cliente: um
 * service nunca precisa lembrar de mascarar manualmente ao montar o payload
 * de erro, o que fecha a lacuna de vazamento de PII em respostas de erro.
 */
export function maskSensitiveDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const masked: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      masked[key] = globalSensitiveFieldNames.has(key) && entry != null ? '***' : maskSensitiveDeep(entry);
    }
    return masked as unknown as T;
  }
  return value;
}

/**
 * Mascaramento parcial de e-mail (`a***@example.com`) para logs que precisam
 * permanecer legíveis/rastreáveis sem expor o endereço completo. Use esta
 * função em vez de reimplementar mascaramento de e-mail localmente em um
 * service — infra central única, ver `Sensitive()` acima.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) {
    return '***';
  }
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}
