import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
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

  @Post('register')
  @ApiBody({ type: RegisterDto })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @ApiBody({ type: LoginDto })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @ApiBody({ type: RefreshDto })
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refreshToken(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('me')
  async me(@Req() req: any) {
    return req.user;
  }

  @Post('generate-token')
  @ApiBody({ type: GenerateTokenDto })
  async generateToken(@Body() body: GenerateTokenDto) {
    return this.auth.generateToken(body.user_id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('send-verification')
  async sendVerification(@Req() req: any) {
    return this.auth.sendVerification(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('verify-email')
  @ApiBody({ type: VerifyEmailDto })
  async verifyEmail(@Req() req: any, @Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(req.user.id, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('change-password')
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, body.current_password, body.new_password);
  }
}