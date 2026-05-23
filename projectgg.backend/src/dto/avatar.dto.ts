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

export class UpdateProfileDto {
    @ApiPropertyOptional({ example: 'New Username' })
    name?: string;

    @ApiPropertyOptional({ example: 'new_username' })
    username?: string;

    @ApiPropertyOptional({ example: 'avatar_01.png' })
    avatar?: string;
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
}
