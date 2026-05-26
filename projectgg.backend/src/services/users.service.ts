import { Injectable } from '@nestjs/common';
import { UsersRepository } from 'src/repositories/users.repository';
import { UserDto } from '../dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getUserDetails(params: { userId?: string; username?: string }): Promise<UserDto | null> {
    return this.usersRepository.findById(params);
  }

  async updateProfile(userId: string, updates: { name?: string; username?: string; email?: string; avatar?: string; email_verified?: boolean; cursor_preference?: string }): Promise<UserDto | null> {
    return this.usersRepository.updateProfile(userId, updates);
  }

  async uploadAvatar(userId: string, file: Buffer, contentType: string, username: string): Promise<string> {
    return this.usersRepository.uploadUserAvatar(userId, file, contentType, username);
  }

  async deleteAvatar(userId: string): Promise<void> {
    return this.usersRepository.deleteUserAvatar(userId);
  }

  async getSystemAvatars(): Promise<{ category: string; avatars: { filename: string; url: string; path: string }[] }[]> {
    return this.usersRepository.getSystemAvatars();
  }

  async validateSystemAvatarPath(path: string): Promise<{ url: string } | null> {
    return this.usersRepository.validateSystemAvatarPath(path);
  }

  async getUserAvatarUrl(userId: string): Promise<string | null> {
    return this.usersRepository.getUserAvatarUrl(userId);
  }
}
