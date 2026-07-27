import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';
import { GlobalExceptionFilter } from './global-exception.filter';
import { ErrorCode } from './error-code.enum';
import { InvalidInputException, ResourceNotFoundException } from './domain.exception';

function mockHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const request = { method: 'GET', url: '/orders/123' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('maps OptimisticLockVersionMismatchError to 409 CONFLICT_CONCURRENT_MODIFICATION', () => {
    const { host, response } = mockHost();
    const error = new OptimisticLockVersionMismatchError('Order', 1, 2);

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: ErrorCode.CONFLICT_CONCURRENT_MODIFICATION }),
    );
  });

  it('maps a unique-constraint QueryFailedError to 409 CONFLICT_DATA_INTEGRITY_VIOLATION', () => {
    const { host, response } = mockHost();
    const error = new QueryFailedError('INSERT', [], new Error('duplicate key'));
    (error as unknown as { code: string }).code = '23505';

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: ErrorCode.CONFLICT_DATA_INTEGRITY_VIOLATION }),
    );
  });

  it('passes through a non-unique QueryFailedError as an internal error', () => {
    const { host, response } = mockHost();
    const error = new QueryFailedError('SELECT', [], new Error('syntax error'));
    (error as unknown as { code: string }).code = '42601';

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: ErrorCode.INTERNAL_ERROR }));
  });

  it('forwards a domain exception body untouched', () => {
    const { host, response } = mockHost();
    const error = new ResourceNotFoundException(ErrorCode.RESOURCE_NOT_FOUND_ORDER, 'Order 123 not found', {
      id: '123',
    });

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      errorCode: ErrorCode.RESOURCE_NOT_FOUND_ORDER,
      message: 'Order 123 not found',
      params: { id: '123' },
    });
  });

  it('maps an InvalidInputException to 400 with its own errorCode', () => {
    const { host, response } = mockHost();
    const error = new InvalidInputException(ErrorCode.VALIDATION_ORDER_EMPTY, 'Order is empty');

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: ErrorCode.VALIDATION_ORDER_EMPTY }),
    );
  });

  it('falls back to a default error code for a plain HttpException without errorCode', () => {
    const { host, response } = mockHost();
    const error = new BadRequestException('bad input');

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: ErrorCode.VALIDATION_CONSTRAINT_VIOLATION, message: 'bad input' }),
    );
  });

  it('maps an unknown exception to 500 INTERNAL_ERROR without leaking details', () => {
    const { host, response } = mockHost();
    const error = new Error('boom, stack trace with secrets');

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      params: {},
    });
  });
});
