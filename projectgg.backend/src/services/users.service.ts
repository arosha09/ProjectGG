import { Injectable } from '@nestjs/common';
import { UsersRepository } from 'src/repositories/users.repository';
import { UserDto } from '../dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getUserDetails(params: { userId?: string; username?: string }): Promise<UserDto | null> {
    return this.usersRepository.findById(params);
  }

  async updateProfile(userId: string, updates: { name?: string; username?: string; avatar?: string }): Promise<UserDto | null> {
    return this.usersRepository.updateProfile(userId, updates);
  }

  async uploadAvatar(userId: string, file: Buffer, filename: string, contentType: string): Promise<string> {
    return this.usersRepository.uploadUserAvatar(userId, file, filename, contentType);
  }

  async deleteAvatar(userId: string): Promise<void> {
    return this.usersRepository.deleteUserAvatar(userId);
  }

  async getSystemAvatars(): Promise<{ filename: string; url: string }[]> {
    return this.usersRepository.getSystemAvatars();
  }

  async getUserAvatarUrl(userId: string): Promise<string | null> {
    return this.usersRepository.getUserAvatarUrl(userId);
  }
}
