import { registerAs } from '@nestjs/config';

export interface EnvConfig {
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
export const envConfig = registerAs(
  'env',
  (): EnvConfig => ({
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
