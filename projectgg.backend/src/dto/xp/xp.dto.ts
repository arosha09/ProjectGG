import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserRankDto {
  @ApiProperty({ example: 1500 })
  total_xp: number;

  @ApiProperty({ example: 'Gold III' })
  rank_name: string;

  @ApiProperty({ example: 'GOLD_III' })
  rank_code: string;

  @ApiProperty({ example: 14 })
  rank_sort_order: number;

  @ApiProperty({ example: 'Gold IV' })
  next_rank_name: string;

  @ApiProperty({ example: 'GOLD_IV' })
  next_rank_code: string;

  @ApiProperty({ example: 100 })
  xp_to_next: number;

  @ApiProperty({ example: 75.5 })
  progress_percent: number;

  @ApiProperty({
    example:
      'https://qpdpzookcfrylxnrqkwo.supabase.co/storage/v1/object/public/system_files/ranks/GOLD_III.png',
  })
  rank_image_url: string;

  @ApiPropertyOptional({
    example:
      'https://qpdpzookcfrylxnrqkwo.supabase.co/storage/v1/object/public/system_files/ranks/GOLD_IV.png',
  })
  next_rank_image_url?: string;
}

export class XpResultDto {
  @ApiProperty({ example: 1550 })
  new_total_xp: number;

  @ApiProperty({ example: 'Gold III' })
  new_rank: string;

  @ApiProperty({ example: 'GOLD_III' })
  new_rank_code: string;

  @ApiProperty({ example: false })
  rank_changed: boolean;
}

export class DailyClaimDto {
  @ApiProperty({ example: 10 })
  xp_earned: number;

  @ApiProperty({ example: 1550 })
  total_xp: number;

  @ApiProperty({ example: 'Gold III' })
  rank_name: string;

  @ApiProperty({ example: '2026-05-22T00:00:00.000Z' })
  can_claim_again: string;
}

export class DailyClaimRequestDto {
  @ApiPropertyOptional({ example: 'uuid' })
  user_id?: string;
}

export class CanClaimDailyDto {
  @ApiProperty({ example: true })
  can_claim: boolean;

  @ApiPropertyOptional({ example: '2026-05-22T00:00:00.000Z' })
  next_claim?: string;
}

export class AwardCustomXpDto {
  @ApiPropertyOptional({ example: 'uuid' })
  user_id?: string;

  @ApiProperty({ example: 25 })
  xp: number;

  @ApiProperty({ example: 'tutorial_complete' })
  source: string;

  @ApiPropertyOptional({ example: 'tutorial_01' })
  source_id?: string;
}

export class LeaderboardEntryDto {
  @ApiProperty({ example: 'uuid-here' })
  user_id: string;

  @ApiProperty({ example: 'player123' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiPropertyOptional({ example: 'avatar.png' })
  avatar?: string;

  @ApiProperty({ example: 1500 })
  total_xp: number;

  @ApiProperty({ example: 'Gold III' })
  rank_name: string;

  @ApiProperty({ example: 'GOLD_III' })
  rank_code: string;

  @ApiProperty({ example: 1 })
  rank_position: number;
}
