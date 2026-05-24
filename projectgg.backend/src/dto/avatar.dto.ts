import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SystemAvatarDto {
    @ApiProperty({ example: 'avatar_01.png' })
    filename: string;

    @ApiProperty({ example: 'https://.../system_files/avatars/avatar_01.png' })
    url: string;
}

export class UserAvatarDto {
    @ApiProperty()
    url: string;

    @ApiPropertyOptional()
    is_system_avatar?: boolean;
}

export class ProfileDto {
    @ApiProperty()
    id: number;

    @ApiProperty()
    email: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    username: string;

    @ApiPropertyOptional()
    avatar?: string;

    @ApiProperty()
    created_at: string;

    @ApiPropertyOptional()
    total_xp?: number;

    @ApiPropertyOptional()
    rank_name?: string;

    @ApiPropertyOptional()
    rank_code?: string;

    @ApiProperty({ example: false })
    email_verified?: boolean;
}

export class UpdateProfileDto {
    @ApiPropertyOptional()
    name?: string;

    @ApiPropertyOptional()
    username?: string;

    @ApiPropertyOptional()
    email?: string;

    @ApiPropertyOptional()
    current_password?: string;

    @ApiPropertyOptional()
    new_password?: string;

    @ApiPropertyOptional()
    avatar?: string;
}

export class VerifyEmailDto {
    @ApiProperty()
    code: string;
}

export class SendVerificationDto {
    @ApiProperty({ example: 'Verification email sent' })
    message: string;
}

export class ChangePasswordDto {
    @ApiProperty()
    current_password: string;

    @ApiProperty()
    new_password: string;
}
