import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { GlobalExceptionFilter } from '../common/exceptions/global-exception.filter';
import { EnvConfig } from '../config/env.config';

/** 1MB - mesmo limite documentado na referencia Java (MaxRequestSizeFilter). */
export const MAX_REQUEST_BODY_SIZE = '1mb';

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';

/**
 * Wiring de app compartilhado entre o bootstrap real (main.ts) e os testes
 * e2e - single source of truth para que um teste e2e que nao chama isso
 * nunca prove menos do que o que roda em producao.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const cors = config.get<EnvConfig['cors']>('env.cors')!;

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );
  // Helmet nao gerencia Permissions-Policy diretamente.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  });

  app.enableCors({ origin: cors.allowedOrigins });

  app.useBodyParser('json', { limit: MAX_REQUEST_BODY_SIZE });
  app.useBodyParser('urlencoded', { limit: MAX_REQUEST_BODY_SIZE, extended: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
}
