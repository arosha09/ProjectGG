export interface UserRankDto {
  total_xp: number;
  rank_name: string;
  rank_code: string;
  rank_sort_order: number;
  next_rank_name: string;
  next_rank_code: string;
  xp_to_next: number;
  progress_percent: number;
  rank_image_url: string;
  next_rank_image_url?: string;
}

export interface DailyClaimDto {
  xp_earned: number;
  total_xp: number;
  rank_name: string;
  can_claim_again: string;
}

export interface CanClaimDailyDto {
  can_claim: boolean;
  next_claim?: string;
}

export interface XpResultDto {
  new_total_xp: number;
  new_rank: string;
  new_rank_code: string;
  rank_changed: boolean;
}

export interface LeaderboardEntryDto {
  user_id: string;
  username: string;
  name: string;
  avatar?: string;
  total_xp: number;
  rank_name: string;
  rank_code: string;
  rank_position: number;
}

export interface AddXpDto {
  user_id: string;
  xp: number;
  source: string;
  source_id?: string;
}

export interface AwardFirstGameBonusDto {
  user_id: string;
}

export interface AddCardToCollectionDto {
  user_id: string;
  game_code: string;
}

export interface RemoveCardFromCollectionDto {
  user_id: string;
  game_code: string;
}

export interface ComputeTierDto {
  rating: number;
}

export interface GenerateGameCodeDto {
  name: string;
}

export interface AdminAddCardDto {
  user_id: string;
  game_code: string;
  tier: string;
}

export interface CollectGameViaTaskDto {
  user_id: string;
  task_id: number;
}
