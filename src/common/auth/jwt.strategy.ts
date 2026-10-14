import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readFileSync } from 'node:fs';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  exp?: number;
  preferred_username?: string;
  aud: string | string[];
  realm_access?: { roles?: string[] };
}

/** Shape exata do que `validate()` retorna - fonte única para quem consome `request.user`. */
export interface RequestUser {
  username: string;
  roles: string[];
}

/** Request tipado para handlers/guards/interceptors que rodam depois do Passport. */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwtFromRequest,
      ignoreExpiration: false,
      // JWT_PUBLIC_KEY_PATH vem de env var de configuracao do operador (nunca de input de
      // request/usuario) - sem risco de path traversal controlado por um cliente.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      secretOrKey: readFileSync(config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH')),
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
      // Opcional: so restringe o emissor quando JWT_ISSUER esta definido (nao quebra quem ainda nao configurou).
      issuer: config.get<string>('JWT_ISSUER'),
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload): RequestUser {
    // jsonwebtoken so confere `exp` quando ele existe: sem esta checagem um token sem expiracao valeria para sempre.
    // E sem `sub` ele nao e atribuivel a ninguem (auditoria, dono do pedido).
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '' || payload.exp === undefined) {
      throw new UnauthorizedException();
    }
    const roles = payload.realm_access?.roles ?? [];
    if (!Array.isArray(roles) || !roles.every((role) => typeof role === 'string')) {
      throw new UnauthorizedException();
    }
    return { username: payload.preferred_username ?? payload.sub, roles };
  }
}

const ExtractJwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
