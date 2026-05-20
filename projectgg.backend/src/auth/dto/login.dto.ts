import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ example: 'john@example.com' })
    email: string;

    @ApiProperty({ example: 'P@ssw0rd123' })
    password: string;
}