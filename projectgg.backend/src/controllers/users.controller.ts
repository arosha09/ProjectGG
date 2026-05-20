import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from 'src/services/users.service';
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
}
