import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.randomBytes(6), b => chars[b % 36]).join('');
}
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../services/users.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly refreshExpiresIn: number;

  constructor(
    private readonly repo: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    this.refreshExpiresIn = parseInt(config.get('JWT_REFRESH_EXPIRES_IN') || '2592000', 10);
  }

  private async resolveUserAvatar(user: any): Promise<void> {
    try {
      const avatarUrl = await this.usersService.getUserAvatarUrl(user.id);
      if (avatarUrl) user.avatar = avatarUrl;
    } catch {}
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
    const verificationToken = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const user = await this.repo.createUser({
      ...payload,
      password_hash: hashedPassword,
      email_verified: false,
      verification_token: verificationToken,
      verification_token_expires: expiresAt,
    });
    const token = this.createToken(user);
    const refresh_token = this.createRefreshToken(user);

    delete user.password_hash;
    delete user.verification_token;
    delete user.verification_token_expires;
    await this.resolveUserAvatar(user);

    try {
      await this.mailService.sendVerificationEmail(user.email, verificationToken, user.name || user.username);
    } catch (e) {
      // Email sending failed silently
    }

    return { user, token, refresh_token, success: true, message: 'User registered successfully. Check your email to verify your account.' };
  }

  async login(dto: LoginDto) {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const match = await bcrypt.compare(dto.password, user.password_hash || '');
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const statusToRestore = user.sys_status ?? user.status ?? 'online';
    const updatedUser = await this.repo.updateUser(user.id, {
      status: statusToRestore,
      sys_status: user.sys_status ?? statusToRestore,
    });
    user.status = updatedUser?.status ?? statusToRestore;
    user.sys_status = updatedUser?.sys_status ?? (user.sys_status ?? statusToRestore);
    
    delete user.password_hash;
    const token = this.createToken(user);
    const refresh_token = this.createRefreshToken(user);
    await this.resolveUserAvatar(user);
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
      await this.resolveUserAvatar(user);
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

  async sendVerification(userId: string): Promise<{ verification_token: string; message: string }> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.email_verified) throw new BadRequestException('Email already verified');

    const verificationToken = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.repo.setVerificationToken(userId, verificationToken, expiresAt);

    try {
      await this.mailService.sendVerificationEmail(user.email, verificationToken, user.name || user.username);
    } catch (e) {
      // Email sending failed silently � token is stored for retry
    }

    return { verification_token: verificationToken, message: 'Verification email sent' };
  }

  async verifyEmail(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.email_verified) throw new BadRequestException('Email already verified');

    if (!user.verification_token || user.verification_token !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (new Date(user.verification_token_expires) < new Date()) {
      throw new BadRequestException('Verification code has expired');
    }

    await this.repo.updateUser(userId, {
      email_verified: true,
      verification_token: null,
      verification_token_expires: null,
    });

    return { message: 'Email verified successfully' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const match = await bcrypt.compare(currentPassword, user.password_hash || '');
    if (!match) throw new UnauthorizedException('Current password is incorrect');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.repo.updateUser(userId, { password_hash: hashedPassword });

    return { message: 'Password changed successfully' };
  }
}