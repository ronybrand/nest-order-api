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
  }),
);
