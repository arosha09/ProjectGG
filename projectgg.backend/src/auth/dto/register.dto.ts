import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'john_doe' })
  username: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  password_hash: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiPropertyOptional({ example: 'user' })
  role?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatar?: string;
}
