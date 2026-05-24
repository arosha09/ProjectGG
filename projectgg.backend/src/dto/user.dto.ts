import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiProperty({ example: 'john_doe' })
  username: string;

  @ApiPropertyOptional({ example: 'https://.../avatar.png' })
  avatar?: string;

  @ApiProperty({ example: '2026-05-20T07:08:13.454547+00:00' })
  created_at: string;

  @ApiProperty({ example: false })
  email_verified?: boolean;
}
