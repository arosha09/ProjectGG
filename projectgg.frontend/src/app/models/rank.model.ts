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
