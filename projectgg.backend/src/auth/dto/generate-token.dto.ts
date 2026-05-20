import { ApiProperty } from '@nestjs/swagger';

export class GenerateTokenDto {
  @ApiProperty({ example: '1fc9d73a-2635-42fa-a72f-dceee35a8bad' })
  user_id: string;
}
