import { ApiProperty } from '@nestjs/swagger';

export class GetAllGamesDto {
    @ApiProperty({ example: "Assassin's Creed" })
    name: string;

    @ApiProperty({ example: 'ACU' })
    code: string;

    @ApiProperty({ example: 'Description for the game' })
    desc: string;

    @ApiProperty({ example: 'https://example.supabase.co/storage/v1/object/sign/game_image/ACU.jpg', required: false })
    imageUrl?: string;

    @ApiProperty({ example: 'https://example.supabase.co/storage/v1/object/sign/game_image/Assassins%20Creed.jpg', required: false })
    series_image_url?: string;

    @ApiProperty({ example: 50, required: false })
    total_count?: number;

    @ApiProperty({ example: 1, required: false })
    sequence_timeline?: number | null;

    @ApiProperty({ example: 3, required: false })
    sequence_release?: number | null;

    @ApiProperty({ example: false, required: false })
    is_series?: boolean;

    @ApiProperty({ example: "Assassin's Creed", required: false, nullable: true })
    series_name?: string | null;
}