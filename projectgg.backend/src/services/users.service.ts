import { Injectable } from '@nestjs/common';
import { UsersRepository } from 'src/repositories/users.repository';
import { UserDto } from '../dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getUserDetails(params: { userId?: string; username?: string }): Promise<UserDto | null> {
    return this.usersRepository.findById(params);
  }
}