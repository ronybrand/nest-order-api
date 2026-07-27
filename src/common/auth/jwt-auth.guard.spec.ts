import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('extends the Passport "jwt" AuthGuard', () => {
    const guard = new JwtAuthGuard();

    expect(guard).toBeInstanceOf(AuthGuard('jwt'));
  });
});
