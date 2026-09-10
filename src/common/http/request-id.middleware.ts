import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Roda antes de qualquer guard/interceptor do Nest (middleware puro do
 * Express), garantindo que todo request - inclusive os rejeitados por auth -
 * tenha um id correlacionavel em logs e na resposta de erro. Reaproveita o
 * id enviado pelo cliente quando presente, para permitir correlacao ponta a
 * ponta atras de um proxy/gateway que ja gera o seu proprio.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER)?.trim();
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
