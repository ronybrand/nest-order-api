import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readFileSync } from 'node:fs';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
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
      secretOrKey: readFileSync(config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH')),
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload): RequestUser {
    return {
      username: payload.preferred_username ?? payload.sub,
      roles: payload.realm_access?.roles ?? [],
    };
  }
}

const ExtractJwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
