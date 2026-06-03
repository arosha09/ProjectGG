import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ConflictException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AuthRepository } from 'src/auth/auth.repository';
import { UsersService } from 'src/services/users.service';
import { UpdateProfileDto, ProfileDto, SystemAvatarDto, SystemAvatarCategoryDto, UserAvatarDto } from '../dto/avatar.dto';
import { UserDto } from '../dto/user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authRepo: AuthRepository,
  ) {}

  @Get('get-user-details')
  @ApiQuery({ name: 'user_id', type: String, required: false, example: '1fc9d73a-2635-42fa-a72f-dceee35a8bad' })
  @ApiQuery({ name: 'username', type: String, required: false, example: 'john_doe' })
  async getUserDetails(
    @Query('user_id') userId?: string,
    @Query('username') username?: string,
  ): Promise<UserDto | null> {
    if (!userId && !username) {
      throw new BadRequestException('Provide either user_id or username');
    }

    return this.usersService.getUserDetails({ userId, username });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('profile')
  async getProfile(@Req() req: any): Promise<ProfileDto> {
    const userId = req.user.id;
    const user = await this.usersService.getUserDetails({ userId });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const avatarUrl = await this.usersService.getUserAvatarUrl(userId);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatar: avatarUrl || undefined,
      created_at: user.created_at,
      email_verified: user.email_verified ?? false,
      cursor_preference: user.cursor_preference || 'cyber',
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('profile')
  @ApiBody({ type: UpdateProfileDto })
  async updateProfile(
    @Req() req: any,
    @Body() body: UpdateProfileDto,
  ): Promise<UserDto> {
    const userId = req.user.id;

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.username !== undefined) {
      const existing = await this.authRepo.findByUsername(body.username);
      if (existing && String(existing.id) !== userId) {
        throw new ConflictException('Username already in use');
      }
      updates.username = body.username;
    }
    if (body.email !== undefined) {
      const existing = await this.authRepo.findByEmail(body.email);
      if (existing && String(existing.id) !== userId) {
        throw new ConflictException('Email already in use');
      }
      updates.email = body.email;
      updates.email_verified = false;
    }

    const updated = await this.usersService.updateProfile(userId, updates);
    if (!updated) {
      throw new BadRequestException('Failed to update profile');
    }
    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('avatar/upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Req() req: any,
    @UploadedFile() file: any,
  ): Promise<UserAvatarDto> {
    const userId = req.user.id;

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
      'image/svg+xml', 'image/bmp', 'image/tiff', 'image/avif',
      'image/x-icon', 'image/vnd.microsoft.icon',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid image format. Allowed: JPEG, PNG, WebP, GIF, SVG, BMP, TIFF, AVIF, ICO');
    }

    const user = await this.usersService.getUserDetails({ userId });
    const username = user?.username || userId;

    const path = await this.usersService.uploadAvatar(userId, file.buffer, file.mimetype, username);

    await this.usersService.updateProfile(userId, { avatar: path });

    const avatarUrl = await this.usersService.getUserAvatarUrl(userId);

    return { url: avatarUrl || '', is_system_avatar: false };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('avatar')
  async deleteAvatar(@Req() req: any): Promise<{ success: boolean }> {
    const userId = req.user.id;
    await this.usersService.deleteAvatar(userId);
    await this.usersService.updateProfile(userId, { avatar: null as any });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('avatar/system')
  async getSystemAvatars(): Promise<SystemAvatarCategoryDto[]> {
    return this.usersService.getSystemAvatars();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('avatar/select')
  async selectSystemAvatar(
    @Req() req: any,
    @Body() body: { path: string },
  ): Promise<UserAvatarDto> {
    const userId = req.user.id;
    if (!body.path) throw new BadRequestException('path is required');

    const avatar = await this.usersService.validateSystemAvatarPath(body.path);
    if (!avatar) {
      throw new BadRequestException('Avatar not found');
    }

    await this.usersService.updateProfile(userId, { avatar: avatar.url });

    return { url: avatar.url, is_system_avatar: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('cursor')
  async updateCursorPreference(
    @Req() req: any,
    @Body() body: { cursor_preference: string },
  ): Promise<{ cursor_preference: string }> {
    const userId = req.user.id;
    const { cursor_preference } = body;

    if (!cursor_preference || typeof cursor_preference !== 'string') {
      throw new BadRequestException('cursor_preference is required');
    }

    await this.usersService.updateProfile(userId, { cursor_preference });
    return { cursor_preference };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('settings')
  async getSettings(@Req() req: any): Promise<{ sound_profile: string; allow_incoming_nudges: boolean; disabled_notification_kinds: string[] }> {
    const userId = req.user.id;
    const settings = await this.usersService.getUserSettings(userId);
    return {
      sound_profile: settings?.sound_profile ?? 'cyber',
      allow_incoming_nudges: settings?.allow_incoming_nudges ?? true,
      disabled_notification_kinds: settings?.disabled_notification_kinds ?? [],
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('settings')
  async updateSettings(
    @Req() req: any,
    @Body() body: { sound_profile?: string; allow_incoming_nudges?: boolean; disabled_notification_kinds?: string[] },
  ): Promise<{ sound_profile: string; allow_incoming_nudges: boolean; disabled_notification_kinds: string[] }> {
    const userId = req.user.id;
    const updated = await this.usersService.updateUserSettings(userId, body);
    return {
      sound_profile: updated?.sound_profile ?? 'cyber',
      allow_incoming_nudges: updated?.allow_incoming_nudges ?? true,
      disabled_notification_kinds: updated?.disabled_notification_kinds ?? [],
    };
  }
}
