import { registerAs } from '@nestjs/config';

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
  rabbitmq: {
    url: string;
  };
  smtp: {
    host: string;
    port: number;
    from: string;
  };
}

/** Factory único registrado via ConfigModule.forRoot({ load: [envConfig] }) para centralizar leitura de env vars. */
function parseCorsAllowedOrigins(): string[] {
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Fail-fast: uma CORS_ALLOWED_ORIGINS vazia significaria silenciosamente
  // bloquear toda origem (ou, pior, um enableCors mal configurado liberando
  // tudo) - preferimos que o boot quebre de forma obvia a esse silencio.
  if (origins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must be set to at least one non-empty origin');
  }

  return origins;
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
