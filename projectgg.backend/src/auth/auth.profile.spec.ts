import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
describe('Authenticated game profile', () => {
  it('returns the account name without exposing authentication secrets', async () => {
    const service: any = Object.create(AuthService.prototype);
    service.repo={findById:jest.fn(async () => ({id:'owner',username:'Operative',email:'fixture@example.test',role:'user',password_hash:'secret',verification_token:'secret'}))};
    expect(await service.me('owner')).toEqual({id:'owner',username:'Operative',email:'fixture@example.test',role:'user'});
  });
  it('rejects a token whose account has been removed', async () => {
    const service: any = Object.create(AuthService.prototype);
    service.repo={findById:jest.fn(async () => null)};
    await expect(service.me('missing')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
