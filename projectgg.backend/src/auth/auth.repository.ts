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

  async createUser(payload: RegisterDto & { password_hash: string }) {
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
        },
      ])
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
