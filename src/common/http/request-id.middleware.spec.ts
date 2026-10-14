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

  it('reuses an incoming x-request-id when it is a canonical UUID', () => {
    const supplied = '3f2a9c1e-0000-4000-8000-000000000001';
    const req = fakeReq({ [REQUEST_ID_HEADER]: supplied });
    const res = fakeRes();
    let observedInsideNext: string | undefined;

    middleware.use(req, res, () => {
      observedInsideNext = currentRequestId();
    });

    expect(observedInsideNext).toBe(supplied);
    expect(res.getHeader(REQUEST_ID_HEADER)).toBe(supplied);
  });

  it('normalizes an uppercase UUID to lowercase', () => {
    const res = fakeRes();

    middleware.use(fakeReq({ [REQUEST_ID_HEADER]: '3F2A9C1E-0000-4000-8000-000000000001' }), res, () => undefined);

    expect(res.getHeader(REQUEST_ID_HEADER)).toBe('3f2a9c1e-0000-4000-8000-000000000001');
  });

  it.each([
    'client-supplied-id-123',
    'x'.repeat(500),
    '<script>alert(1)</script>',
    ' - INFO - forged log line',
    '{3f2a9c1e-0000-4000-8000-000000000001}',
    '3f2a9c1e000040008000000000000001',
  ])('replaces an incoming id that is not a canonical UUID (%#)', (supplied) => {
    const res = fakeRes();
    let observedInsideNext: string | undefined;

    middleware.use(fakeReq({ [REQUEST_ID_HEADER]: supplied }), res, () => {
      observedInsideNext = currentRequestId();
    });

    expect(observedInsideNext).not.toBe(supplied);
    expect(observedInsideNext).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.getHeader(REQUEST_ID_HEADER)).toBe(observedInsideNext);
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
