import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export abstract class DomainException extends HttpException {
  protected constructor(
    status: HttpStatus,
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly params: Record<string, unknown> = {},
  ) {
    super({ errorCode, message, params }, status);
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(errorCode: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super(HttpStatus.NOT_FOUND, errorCode, message, params);
  }
}

export class ConflictException extends DomainException {
  constructor(errorCode: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super(HttpStatus.CONFLICT, errorCode, message, params);
  }
}

export class InvalidInputException extends DomainException {
  constructor(errorCode: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super(HttpStatus.BAD_REQUEST, errorCode, message, params);
  }
}
