import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(payload: RegisterDto) {
    const existingUser = await this.repo.findByEmail(payload.email);
    if (existingUser) {
      throw new ConflictException('Email already in use');
    } else if (payload.username) {
      const existingUsername = await this.repo.findByUsername(payload.username);
      if (existingUsername) {
        throw new ConflictException('Username already in use');
      }
    }
    const hashedPassword = await bcrypt.hash(payload.password_hash, 10);
    const user = await this.repo.createUser({
      ...payload,
      password_hash: hashedPassword,
    });
    const token = this.createToken(user);

    delete user.password_hash;
    return { user, token, success: true, message: 'User registered successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const match = await bcrypt.compare(dto.password, user.password_hash || '');
    if (!match) throw new UnauthorizedException('Invalid credentials');
    delete user.password_hash;
    const token = this.createToken(user);
    return { user, token, success: true, message: 'User logged in successfully' };
  }

  createToken(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  async generateToken(user_id: string) {
    const user = await this.repo.findById(user_id);
    if (!user) throw new NotFoundException('User not found');
    const token = this.createToken(user);
    return { token, success: true, message: 'Token generated successfully' };
  }
}
