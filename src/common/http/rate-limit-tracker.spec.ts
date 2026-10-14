import { generateKeyPairSync } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { createRateLimitTracker } from './rate-limit-tracker';

describe('createRateLimitTracker', () => {
  const rsa = () =>
    generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  const trusted = rsa();
  const stranger = rsa();
  const jwt = new JwtService();

  const sign = (claims: Record<string, unknown>, privateKey = trusted.privateKey, options: object = {}) =>
    jwt.sign(claims, { algorithm: 'RS256', privateKey, ...options });

  const tracker = createRateLimitTracker({ publicKey: trusted.publicKey, audience: 'nest-order-api' });
  const request = (authorization?: string, ip = '203.0.113.9') => ({
    ip,
    headers: authorization ? { authorization } : {},
  });

  it('partitions authenticated callers by subject, not by address', () => {
    const token = sign({ sub: 'user-42' }, trusted.privateKey, { audience: 'nest-order-api', expiresIn: '1h' });

    expect(tracker(request(`Bearer ${token}`))).toBe('user:user-42');
  });

  it('gives two users behind the same address separate buckets', () => {
    const options = { audience: 'nest-order-api', expiresIn: '1h' };
    const a = tracker(request(`Bearer ${sign({ sub: 'a' }, trusted.privateKey, options)}`));
    const b = tracker(request(`Bearer ${sign({ sub: 'b' }, trusted.privateKey, options)}`));

    expect(a).not.toBe(b);
  });

  it.each([
    ['no header', undefined],
    ['a non-bearer scheme', 'Basic abc'],
    ['garbage', 'Bearer not-a-jwt'],
  ])('falls back to the address for %s', (_label, header) => {
    expect(tracker(request(header))).toBe('203.0.113.9');
  });

  it('ignores a token signed by someone else (a forged key must not pick the bucket)', () => {
    const forged = sign({ sub: 'victim' }, stranger.privateKey, { audience: 'nest-order-api', expiresIn: '1h' });

    expect(tracker(request(`Bearer ${forged}`))).toBe('203.0.113.9');
  });

  it('ignores an expired token, a wrong audience and a token without exp', () => {
    const expired = sign({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 60 }, trusted.privateKey, {
      audience: 'nest-order-api',
    });
    const wrongAudience = sign({ sub: 'u' }, trusted.privateKey, { audience: 'other', expiresIn: '1h' });
    const noExp = sign({ sub: 'u' }, trusted.privateKey, { audience: 'nest-order-api' });

    expect(tracker(request(`Bearer ${expired}`))).toBe('203.0.113.9');
    expect(tracker(request(`Bearer ${wrongAudience}`))).toBe('203.0.113.9');
    expect(tracker(request(`Bearer ${noExp}`))).toBe('203.0.113.9');
  });

  it('checks the issuer when one is configured', () => {
    const strict = createRateLimitTracker({
      publicKey: trusted.publicKey,
      audience: 'nest-order-api',
      issuer: 'https://idp.example',
    });
    const wrong = sign({ sub: 'u' }, trusted.privateKey, {
      audience: 'nest-order-api',
      issuer: 'https://evil.example',
      expiresIn: '1h',
    });
    const right = sign({ sub: 'u' }, trusted.privateKey, {
      audience: 'nest-order-api',
      issuer: 'https://idp.example',
      expiresIn: '1h',
    });

    expect(strict(request(`Bearer ${wrong}`))).toBe('203.0.113.9');
    expect(strict(request(`Bearer ${right}`))).toBe('user:u');
  });

  it('falls back to a constant when there is neither a valid token nor an address', () => {
    expect(tracker({ headers: {} })).toBe('unknown');
  });
});
