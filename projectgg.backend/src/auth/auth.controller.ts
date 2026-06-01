import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt.guard';
import { VerifyEmailDto, ChangePasswordDto } from '../dto/avatar.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('register')
  @ApiBody({ type: RegisterDto })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiBody({ type: LoginDto })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @ApiBody({ type: RefreshDto })
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refreshToken(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @ApiBearerAuth('access-token')
  @Get('me')
  async me(@Req() req: any) {
    return req.user;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('generate-token')
  @ApiBody({ type: GenerateTokenDto })
  async generateToken(@Body() body: GenerateTokenDto) {
    return this.auth.generateToken(body.user_id);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiBearerAuth('access-token')
  @Post('send-verification')
  async sendVerification(@Req() req: any) {
    return this.auth.sendVerification(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiBearerAuth('access-token')
  @Post('verify-email')
  @ApiBody({ type: VerifyEmailDto })
  async verifyEmail(@Req() req: any, @Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(req.user.id, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiBearerAuth('access-token')
  @Post('change-password')
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, body.current_password, body.new_password);
  }
}