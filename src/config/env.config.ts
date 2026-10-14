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
    /** STARTTLS obrigatorio fora de desenvolvimento e sempre que houver usuario (ver parseSmtp). */
    starttls: boolean;
    user?: string;
    password?: string;
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

const SAFE_DEFAULT_ENVS = new Set(['development', 'test']);

/** NODE_ENV ausente conta como desenvolvimento local; qualquer valor desconhecido conta como producao. */
function isProduction(): boolean {
  const env = process.env.NODE_ENV;
  return env !== undefined && !SAFE_DEFAULT_ENVS.has(env);
}

/**
 * O default guest:guest em texto claro so existe fora de producao; em producao a URL e obrigatoria e tem que
 * ser amqps:// (a fila carrega e-mail e nome do cliente).
 */
function parseRabbitMqUrl(): string {
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    if (isProduction()) {
      throw new Error('RABBITMQ_URL must be set when NODE_ENV is not development/test');
    }
    return 'amqp://guest:guest@localhost:5672';
  }
  if (isProduction() && !url.startsWith('amqps://')) {
    throw new Error('RABBITMQ_URL must use amqps:// (TLS) when NODE_ENV is not development/test');
  }
  return url;
}

/**
 * Default = Mailpit local (sem TLS). Fora de desenvolvimento STARTTLS e obrigatorio, e credencial nunca
 * trafega em conexao sem TLS, em nenhum ambiente.
 */
function parseSmtp(): EnvConfig['smtp'] {
  const starttls = process.env.SMTP_STARTTLS === 'true';
  const user = process.env.SMTP_USER || undefined;
  if (!starttls && (isProduction() || user)) {
    throw new Error('SMTP_STARTTLS=true is required when NODE_ENV is not development/test and whenever SMTP_USER is set');
  }
  return {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    from: process.env.SMTP_FROM ?? 'no-reply@order-api.local',
    starttls,
    user,
    password: user ? process.env.SMTP_PASSWORD : undefined,
  };
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
      url: parseRabbitMqUrl(),
    },
    smtp: parseSmtp(),
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
