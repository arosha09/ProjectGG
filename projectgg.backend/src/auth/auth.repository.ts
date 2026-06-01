import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  async findByEmail(email: string) {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }

  async findByUsername(username: string) {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }

  async createUser(payload: RegisterDto & { password_hash: string; email_verified?: boolean; verification_token?: string; verification_token_expires?: string }) {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .insert([
        {
          username: payload.username,
          email: payload.email,
          name: payload.name,
          date_of_birth: payload.date_of_birth,
          gender: payload.gender,
          password_hash: payload.password_hash,
          role: payload.role ?? 'user',
          avatar: payload.avatar,
          email_verified: payload.email_verified ?? false,
          verification_token: payload.verification_token,
          verification_token_expires: payload.verification_token_expires,
        },
      ])
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async updateUser(id: string, updates: Record<string, any>): Promise<any> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async setVerificationToken(userId: string, token: string, expiresAt: string): Promise<void> {
    const { error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update({
        verification_token: token,
        verification_token_expires: expiresAt,
      })
      .eq('id', userId);

    if (error) throw new InternalServerErrorException(error.message);
  }

  async recordFailedLogin(userId: string): Promise<{ attempts: number; lockedUntil: string | null }> {
    const { data: current, error: fetchErr } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('failed_login_attempts')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);

    const attempts = (current?.failed_login_attempts ?? 0) + 1;
    const shouldLock = attempts >= 5;
    const lockedUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

    const { error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update({
        failed_login_attempts: shouldLock ? 0 : attempts,
        locked_until: lockedUntil,
      })
      .eq('id', userId);

    if (error) throw new InternalServerErrorException(error.message);
    return { attempts: shouldLock ? 0 : attempts, lockedUntil };
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update({ failed_login_attempts: 0, locked_until: null })
      .eq('id', userId);

    if (error) throw new InternalServerErrorException(error.message);
  }
}
