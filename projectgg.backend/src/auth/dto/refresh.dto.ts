import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  refresh_token: string;
}
