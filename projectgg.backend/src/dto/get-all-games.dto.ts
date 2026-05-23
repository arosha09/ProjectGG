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

    @ApiProperty({ example: ['Action', 'Adventure'], required: false })
    genres?: string[];

    @ApiProperty({ example: 'https://cdn.akamai.steamstatic.com/steam/apps/289470/header.jpg', required: false })
    cover_url?: string;

    @ApiProperty({ example: '289470', required: false })
    external_id?: string;

    @ApiProperty({ example: 'steam', required: false })
    external_source?: string;

    @ApiProperty({ example: 85, required: false })
    rating?: number | null;

    @ApiProperty({ example: 2014, required: false })
    release_year?: number | null;

    @ApiProperty({ example: ['pc', 'ps5'], required: false })
    platforms?: string[];

    @ApiProperty({ example: ['steam', 'rawg'], required: false })
    sources?: string[];
}