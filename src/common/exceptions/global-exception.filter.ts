import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';
import { ErrorCode } from './error-code.enum';
import { currentRequestId } from '../http/request-context';

/**
 * Único ponto de tradução de exceção -> resposta HTTP. Nunca formate erro
 * inline num controller/service; lance a exceção de domínio correspondente
 * e deixe este filtro decidir o payload.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof OptimisticLockVersionMismatchError) {
      this.send(response, HttpStatus.CONFLICT, ErrorCode.CONFLICT_CONCURRENT_MODIFICATION, exception.message);
      return;
    }

    if (exception instanceof QueryFailedError && this.isUniqueViolation(exception)) {
      this.send(response, HttpStatus.CONFLICT, ErrorCode.CONFLICT_DATA_INTEGRITY_VIOLATION, 'Data integrity violation');
      return;
    }

    if (this.isPayloadTooLarge(exception)) {
      this.send(response, HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.VALIDATION_PAYLOAD_TOO_LARGE, 'Request body too large');
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'errorCode' in body) {
        response.status(status).json({ ...body, requestId: currentRequestId() });
        return;
      }
      this.send(response, status, this.defaultCodeFor(status), exception.message);
      return;
    }

    this.logger.error(`Unhandled error on ${request.method} ${request.url}`, exception as Error);
    this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }

  private isPayloadTooLarge(exception: unknown): boolean {
    // body-parser (via raw-body/http-errors) lanca um erro simples, nao um
    // HttpException do Nest - type é o identificador estavel da lib, status
    // pode variar entre versoes/forks então checamos os dois defensivamente.
    const err = exception as { type?: string; status?: number; statusCode?: number };
    return err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413;
  }

  private isUniqueViolation(error: QueryFailedError): boolean {
    return (error as unknown as { code?: string }).code === '23505';
  }

  private defaultCodeFor(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_CONSTRAINT_VIOLATION;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.AUTHORIZATION_ACCESS_DENIED;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.VALIDATION_RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private send(response: Response, status: number, errorCode: ErrorCode, message: string): void {
    response.status(status).json({ errorCode, message, params: {}, requestId: currentRequestId() });
  }
}
