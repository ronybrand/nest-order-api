import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { currentUserStorage } from './current-user';

interface AuthenticatedRequest extends Request {
  user?: { username?: string; roles?: string[] };
}

/**
 * Precisa ser um interceptor, não um middleware: middlewares do Express
 * rodam antes dos guards do Nest, então `req.user` (preenchido pelo
 * JwtAuthGuard via Passport) ainda não existiria - todo request cairia no
 * fallback 'system' e quebraria audit trail e ownership scoping.
 * Interceptors rodam depois dos guards, garantindo `req.user` já resolvido.
 */
@Injectable()
export class CurrentUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const username = request.user?.username ?? 'system';
    const roles = request.user?.roles ?? [];

    return new Observable((subscriber) => {
      currentUserStorage.run({ username, roles }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
