import { ConfigService, registerAs } from '@nestjs/config';

export interface EnvConfig {
  cors: {
    allowedOrigins: string[];
  };
  pagination: {
    defaultPage: number;
    defaultSize: number;
    maxSize: number;
  };
  rateLimit: {
    points: number;
    duration: number;
  };
  /** IPs (ou faixas CIDR) de proxies/load balancers confiáveis - ver parseTrustedProxies. */
  trustedProxies: string[];
  rabbitmq: {
    url: string;
  };
  smtp: {
    host: string;
    port: number;
    from: string;
  };
}

/**
 * Parser comum para env vars de lista (CSV): "a, b ,c" -> ['a', 'b', 'c'],
 * ignorando entradas vazias. Com `required: true`, lista vazia é tratada
 * como configuração ausente e quebra o boot (fail-fast) em vez de deixar o
 * comportamento resultante (ex. bloquear toda origem CORS) implícito.
 */
function parseCsvEnv(envVarName: string, options: { required: boolean }): string[] {
  const values = (process.env[envVarName] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (options.required && values.length === 0) {
    throw new Error(`${envVarName} must be set to at least one non-empty value`);
  }

  return values;
}

/** Factory único registrado via ConfigModule.forRoot({ load: [envConfig] }) para centralizar leitura de env vars. */
function parseCorsAllowedOrigins(): string[] {
  // Fail-fast: uma CORS_ALLOWED_ORIGINS vazia significaria silenciosamente
  // bloquear toda origem (ou, pior, um enableCors mal configurado liberando
  // tudo) - preferimos que o boot quebre de forma obvia a esse silencio.
  return parseCsvEnv('CORS_ALLOWED_ORIGINS', { required: true });
}

/**
 * Sem TRUSTED_PROXIES, express não confia em X-Forwarded-For e usa o IP do
 * socket direto - seguro por padrão. Só quando o app roda atrás de um
 * proxy/load balancer conhecido (ex. ALB, nginx) é que essa lista deve ser
 * preenchida, para que o rate limiter (req.ip) resolva o IP real do cliente
 * em vez do IP do proxy, sem abrir brecha para spoofing de X-Forwarded-For
 * por um cliente direto.
 */
function parseTrustedProxies(): string[] {
  return parseCsvEnv('TRUSTED_PROXIES', { required: false });
}

export const envConfig = registerAs(
  'env',
  (): EnvConfig => ({
    cors: {
      allowedOrigins: parseCorsAllowedOrigins(),
    },
    pagination: {
      defaultPage: Number(process.env.PAGINATION_DEFAULT_PAGE ?? 0),
      defaultSize: Number(process.env.PAGINATION_DEFAULT_SIZE ?? 20),
      maxSize: Number(process.env.PAGINATION_MAX_SIZE ?? 100),
    },
    rateLimit: {
      points: Number(process.env.RATE_LIMIT_POINTS ?? 100),
      duration: Number(process.env.RATE_LIMIT_DURATION_SECONDS ?? 60),
    },
    trustedProxies: parseTrustedProxies(),
    rabbitmq: {
      url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    },
    smtp: {
      // Default: Mailpit (docker-compose), catch-all SMTP local para dev - nenhum e-mail
      // real e enviado, mas o fluxo de envio via nodemailer roda de ponta a ponta.
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      from: process.env.SMTP_FROM ?? 'no-reply@order-api.local',
    },
  }),
);

/**
 * Le uma secao do namespace 'env' sem repetir a chave como tipo E como
 * string literal (`config.get<EnvConfig['x']>('env.x')!`) em cada
 * callsite. O `!` e seguro aqui: `envConfig` sempre popula o namespace
 * completo, entao nenhuma secao fica ausente em runtime.
 */
export function getEnv<K extends keyof EnvConfig>(config: ConfigService, key: K): EnvConfig[K] {
  return config.get<EnvConfig[K]>(`env.${key}`)!;
}
