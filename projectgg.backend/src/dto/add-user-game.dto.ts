import { ApiProperty } from '@nestjs/swagger';

export class AddUserGameDto {
  @ApiProperty({ example: 'user-123' })
  user_id: string;

  @ApiProperty({ example: 42 })
  game_code: number;
}
