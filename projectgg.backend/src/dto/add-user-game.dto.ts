import { ApiProperty } from '@nestjs/swagger';

export class AddUserGameDto {
  @ApiProperty({ example: 'user-123' })
  in_user_id: string;

  @ApiProperty({ example: 'AC1' })
  in_game_code: string;
}
