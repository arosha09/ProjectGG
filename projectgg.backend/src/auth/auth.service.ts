import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly refreshExpiresIn: number;

  constructor(
    private readonly repo: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshExpiresIn = parseInt(config.get('JWT_REFRESH_EXPIRES_IN') || '2592000', 10);
  }

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
    const refresh_token = this.createRefreshToken(user);

    delete user.password_hash;
    return { user, token, refresh_token, success: true, message: 'User registered successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const match = await bcrypt.compare(dto.password, user.password_hash || '');
    if (!match) throw new UnauthorizedException('Invalid credentials');
    delete user.password_hash;
    const token = this.createToken(user);
    const refresh_token = this.createRefreshToken(user);
    return { user, token, refresh_token, success: true, message: 'User logged in successfully' };
  }

  async refreshToken(refreshTokenStr: string) {
    try {
      const payload = this.jwtService.verify(refreshTokenStr);
      const user = await this.repo.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      delete user.password_hash;
      const token = this.createToken(user);
      const refresh_token = this.createRefreshToken(user);
      return { user, token, refresh_token, success: true, message: 'Token refreshed successfully' };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  createToken(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  createRefreshToken(user: any) {
    const payload = { sub: user.id, type: 'refresh' };
    return this.jwtService.sign(payload, { expiresIn: this.refreshExpiresIn });
  }

  async generateToken(user_id: string) {
    const user = await this.repo.findById(user_id);
    if (!user) throw new NotFoundException('User not found');
    const refresh_token = this.createRefreshToken(user);
    const token = this.createToken(user);
    return { token, refresh_token, success: true, message: 'Token generated successfully' };
  }
}