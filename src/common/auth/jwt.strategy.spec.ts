import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let tmpDir: string;
  let publicKeyPath: string;

  beforeAll(() => {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    tmpDir = mkdtempSync(join(tmpdir(), 'nest-order-api-jwt-spec-'));
    publicKeyPath = join(tmpDir, 'public.pem');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- diretorio temporario criado pelo proprio teste
    writeFileSync(publicKeyPath, publicKey);
  });

  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  const strategy = (extra: Record<string, string> = {}) =>
    new JwtStrategy(
      new ConfigService({ JWT_PUBLIC_KEY_PATH: publicKeyPath, JWT_AUDIENCE: 'nest-order-api', ...extra }),
    );

  const payload = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
    sub: 'user-1',
    aud: 'nest-order-api',
    exp: Math.floor(Date.now() / 1000) + 3600,
    realm_access: { roles: ['USER'] },
    ...overrides,
  });

  const verifyOptions = (instance: JwtStrategy) =>
    (instance as unknown as { _verifOpts: Record<string, unknown> })._verifOpts;

  it('maps a well-formed payload to the request user', () => {
    expect(strategy().validate(payload({ preferred_username: 'ana' }))).toEqual({
      username: 'ana',
      roles: ['USER'],
    });
  });

  it('falls back to the subject when there is no preferred_username', () => {
    expect(strategy().validate(payload()).username).toBe('user-1');
  });

  it.each([undefined, '', '   '])('rejects a token whose subject is %p', (sub) => {
    expect(() => strategy().validate(payload({ sub: sub as unknown as string }))).toThrow(UnauthorizedException);
  });

  it('rejects a token without exp (it would be valid forever)', () => {
    expect(() => strategy().validate(payload({ exp: undefined }))).toThrow(UnauthorizedException);
  });

  it.each([
    ['a string', 'ADMIN'],
    ['an object', { ADMIN: true }],
    ['a list with a non-string', ['USER', 1]],
    ['a number', 7],
  ])('rejects a roles claim that is %s', (_label, roles) => {
    expect(() =>
      strategy().validate(payload({ realm_access: { roles: roles as unknown as string[] } })),
    ).toThrow(UnauthorizedException);
  });

  it('treats a missing realm_access as no roles', () => {
    expect(strategy().validate(payload({ realm_access: undefined })).roles).toEqual([]);
  });

  it('only accepts RS256 and checks the audience', () => {
    const options = verifyOptions(strategy());
    expect(options.algorithms).toEqual(['RS256']);
    expect(options.audience).toBe('nest-order-api');
  });

  it('checks the issuer when JWT_ISSUER is configured', () => {
    expect(verifyOptions(strategy({ JWT_ISSUER: 'https://idp.example/realms/orders' })).issuer).toBe(
      'https://idp.example/realms/orders',
    );
  });

  it('does not constrain the issuer when JWT_ISSUER is not configured', () => {
    expect(verifyOptions(strategy()).issuer).toBeUndefined();
  });
});
