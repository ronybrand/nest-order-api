import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { currentUserStorage } from './current-user';

interface AuthenticatedRequest extends Request {
  user?: { username?: string };
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    const username = req.user?.username ?? 'system';
    currentUserStorage.run(username, next);
  }
}
