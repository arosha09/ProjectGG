import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncQueueDto {
  @ApiProperty({ example: 'ACU' })
  code: string;

  @ApiProperty({ example: "Assassin's Creed Unity" })
  name: string;

  @ApiProperty({ example: ['cover', 'genres', 'rating'] })
  missing: string[];

  @ApiPropertyOptional({ example: ['cover_url', 'rating'] })
  locked_columns?: string[];
}

export class SyncProgressDto {
  @ApiProperty({ example: 10 })
  completed: number;

  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: 'ACU' })
  current: string;

  @ApiProperty({ example: 'Synced via Steam' })
  status: string;
}

export class SyncResultDto {
  @ApiProperty({ example: 'ACU' })
  code: string;

  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Synced via Steam' })
  message: string;

  @ApiPropertyOptional({ example: ['Action', 'Adventure'] })
  genres?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.akamai.steamstatic.com/steam/apps/289470/header.jpg' })
  cover_url?: string;

  @ApiPropertyOptional({ example: 'steam' })
  source?: string;

  @ApiPropertyOptional({ example: 85 })
  rating?: number | null;

  @ApiPropertyOptional({ example: 2014 })
  release_year?: number | null;

  @ApiPropertyOptional({ example: "An open-world action-adventure game set in Paris during the French Revolution." })
  desc?: string;

  @ApiPropertyOptional({ example: '289470' })
  external_id?: string;

  @ApiPropertyOptional({ example: ['pc', 'ps5'] })
  platforms?: string[];

  @ApiPropertyOptional({ example: ['steam', 'rawg'] })
  sources?: string[];

  @ApiPropertyOptional({ example: "Assassin's Creed I" })
  search_name?: string;
}

export class SyncSearchResultDto {
  @ApiProperty({ example: '289470' })
  id: number;

  @ApiProperty({ example: "Assassin's Creed Unity" })
  name: string;

  @ApiProperty({ example: 'https://media.rawg.io/media/games/...jpg' })
  cover_url: string;

  @ApiProperty({ example: 2014 })
  release_year: number;

  @ApiProperty({ example: ['Action', 'Adventure'] })
  genres: string[];

  @ApiProperty({ example: ['steam', 'rawg'] })
  sources: string[];

  @ApiPropertyOptional({ example: 85 })
  rating?: number | null;

  @ApiPropertyOptional({ example: "An open-world action-adventure game..." })
  desc?: string;

  @ApiProperty({ example: ['pc', 'ps5'] })
  platforms: string[];
}
