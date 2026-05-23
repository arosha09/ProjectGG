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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { UsersService } from 'src/services/users.service';
import { UpdateProfileDto, ProfileDto, SystemAvatarDto, UserAvatarDto } from '../dto/avatar.dto';
import { UserDto } from '../dto/user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
      id: Number(user.id),
      email: user.email,
      name: user.name,
      username: user.username,
      avatar: avatarUrl || undefined,
      created_at: user.created_at,
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
    const updated = await this.usersService.updateProfile(userId, body);
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

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed');
    }

    const url = await this.usersService.uploadAvatar(userId, file.buffer, file.originalname, file.mimetype);

    await this.usersService.updateProfile(userId, { avatar: url });

    return { url, is_system_avatar: false };
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
  async getSystemAvatars(): Promise<SystemAvatarDto[]> {
    return this.usersService.getSystemAvatars();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('avatar/select')
  async selectSystemAvatar(
    @Req() req: any,
    @Body() body: { filename: string },
  ): Promise<UserAvatarDto> {
    const userId = req.user.id;
    const avatars = await this.usersService.getSystemAvatars();
    const avatar = avatars.find((a) => a.filename === body.filename);

    if (!avatar) {
      throw new BadRequestException('Avatar not found');
    }

    await this.usersService.updateProfile(userId, { avatar: avatar.url });

    return { url: avatar.url, is_system_avatar: true };
  }
}
