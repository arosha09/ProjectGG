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

  @ApiProperty({ example: '1990-01-01' })
  date_of_birth: Date;

  @ApiProperty({ example: 'Male' })
  gender: string;

  @ApiPropertyOptional({ example: 'user' })
  role?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatar?: string;
}
