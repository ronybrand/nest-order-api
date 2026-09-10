import { Request, Response } from 'express';
import { RequestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';
import { currentRequestId } from './request-context';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  function fakeReq(headers: Record<string, string> = {}): Request {
    return {
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
  }

  function fakeRes(): Response {
    const headers: Record<string, string> = {};
    return {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      getHeader: (name: string) => headers[name],
    } as unknown as Response;
  }

  it('generates a new request id when none is provided and exposes it via currentRequestId() inside next()', () => {
    const req = fakeReq();
    const res = fakeRes();
    let observedInsideNext: string | undefined;

    middleware.use(req, res, () => {
      observedInsideNext = currentRequestId();
    });

    expect(observedInsideNext).toBeDefined();
    expect(observedInsideNext).toEqual(res.getHeader(REQUEST_ID_HEADER));
  });

  it('reuses an incoming x-request-id header instead of generating a new one', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: 'client-supplied-id-123' });
    const res = fakeRes();
    let observedInsideNext: string | undefined;

    middleware.use(req, res, () => {
      observedInsideNext = currentRequestId();
    });

    expect(observedInsideNext).toBe('client-supplied-id-123');
    expect(res.getHeader(REQUEST_ID_HEADER)).toBe('client-supplied-id-123');
  });

  it('generates a fresh id when the incoming header is blank', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: '   ' });
    const res = fakeRes();
    let observedInsideNext: string | undefined;

    middleware.use(req, res, () => {
      observedInsideNext = currentRequestId();
    });

    expect(observedInsideNext).toBeDefined();
    expect(observedInsideNext?.trim().length).toBeGreaterThan(0);
    expect(observedInsideNext).not.toBe('   ');
  });

  it('leaves no request id visible after next() (context does not leak across requests)', () => {
    middleware.use(fakeReq(), fakeRes(), () => {
      /* no-op */
    });

    expect(currentRequestId()).toBeUndefined();
  });
});
