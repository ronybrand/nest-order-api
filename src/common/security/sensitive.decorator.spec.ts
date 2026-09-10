import { Sensitive, maskEmail, maskSensitive, maskSensitiveDeep } from './sensitive.decorator';

class Probe {
  @Sensitive()
  probeSecret!: string;

  visible!: string;
}

describe('Sensitive / maskSensitive', () => {
  it('masks only the fields marked with @Sensitive on the instance', () => {
    const instance = new Probe();
    instance.probeSecret = 'super-secret';
    instance.visible = 'ok';

    expect(maskSensitive(instance)).toEqual({ probeSecret: '***', visible: 'ok' });
  });
});

describe('maskSensitiveDeep', () => {
  it('masks a top-level key registered by @Sensitive, regardless of the originating class', () => {
    expect(maskSensitiveDeep({ probeSecret: 'value', other: 'kept' })).toEqual({
      probeSecret: '***',
      other: 'kept',
    });
  });

  it('masks a @Sensitive key nested inside an object or array', () => {
    const input = {
      list: [{ probeSecret: 'a' }, { probeSecret: 'b', other: 'kept' }],
      nested: { probeSecret: 'c' },
    };

    expect(maskSensitiveDeep(input)).toEqual({
      list: [{ probeSecret: '***' }, { probeSecret: '***', other: 'kept' }],
      nested: { probeSecret: '***' },
    });
  });

  it('leaves non-sensitive values, null and primitives untouched', () => {
    expect(maskSensitiveDeep({ a: 1, b: null, c: undefined })).toEqual({ a: 1, b: null, c: undefined });
    expect(maskSensitiveDeep('plain string')).toBe('plain string');
  });

  it('does not mutate a Date value passed through it', () => {
    const date = new Date('2024-01-01T00:00:00Z');

    expect(maskSensitiveDeep(date)).toBe(date);
  });
});

describe('maskEmail', () => {
  it('keeps only the first character of the local part visible', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
  });

  it('falls back to a fully masked placeholder when there is no domain', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
