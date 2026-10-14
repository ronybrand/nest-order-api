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
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O id vem do cliente e acaba em log, header e corpo de erro: so um UUID canonico e aceito; qualquer outra
 * coisa (texto livre, quebra de linha, 10 KB de lixo) e descartada e substituida, o que fecha log forging.
 */
function acceptedRequestId(supplied: string | undefined): string {
  const candidate = supplied?.trim();
  return candidate && CANONICAL_UUID.test(candidate) ? candidate.toLowerCase() : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = acceptedRequestId(req.header(REQUEST_ID_HEADER));

    res.setHeader(REQUEST_ID_HEADER, requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
