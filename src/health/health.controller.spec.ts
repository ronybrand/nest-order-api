import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('answers ok when the database responds', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    await expect(new HealthController(dataSource as never).check()).resolves.toEqual({ status: 'ok' });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('answers 503 when the database does not respond', async () => {
    const dataSource = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };

    await expect(new HealthController(dataSource as never).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('is exempt from rate limiting, so ordinary traffic can never make a healthy instance look dead', () => {
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', HealthController)).toBe(true);
  });

  it('is public: it declares no auth guard', () => {
    expect(Reflect.getMetadata('__guards__', HealthController)).toBeUndefined();
  });
});
