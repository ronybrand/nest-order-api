import { readFileSync } from 'node:fs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface RateLimitTrackerOptions {
  publicKey: string | Buffer;
  audience: string;
  issuer?: string;
}

/**
 * Chave do balde do rate limiter. Quem tem um token valido (assinatura, audience, issuer, exp) e limitado por
 * usuario (`sub`); o resto, por endereco. So por endereco, todos os usuarios atras do mesmo proxy/NAT dividiriam
 * um balde, e um usuario trocando de IP escaparia do dele. O token e verificado por inteiro: uma chave forjada
 * nao serve para escolher o balde de outro usuario.
 */
export function createRateLimitTracker(options: RateLimitTrackerOptions) {
  const jwt = new JwtService();
  return (req: Record<string, unknown>): string => {
    const header = (req.headers as Record<string, unknown> | undefined)?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify<{ sub?: unknown; exp?: unknown }>(header.slice('Bearer '.length), {
          publicKey: options.publicKey,
          algorithms: ['RS256'],
          audience: options.audience,
          issuer: options.issuer,
        });
        if (typeof payload.sub === 'string' && payload.sub.trim() !== '' && payload.exp !== undefined) {
          return `user:${payload.sub}`;
        }
      } catch {
        // token invalido: cai no endereco
      }
    }
    return typeof req.ip === 'string' && req.ip !== '' ? req.ip : 'unknown';
  };
}

export function rateLimitTrackerFrom(config: ConfigService) {
  return createRateLimitTracker({
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caminho vem da configuracao, nao de input
    publicKey: readFileSync(config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH')),
    audience: config.getOrThrow<string>('JWT_AUDIENCE'),
    issuer: config.get<string>('JWT_ISSUER'),
  });
}
