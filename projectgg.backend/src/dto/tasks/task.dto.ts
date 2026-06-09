export class CreateTaskDto {
  title!: string;
  description?: string;
  task_kind?: 'duration' | 'achievement' | 'test';
  achievement_type?:
    | 'cards_collected'
    | 'cards_favorited'
    | 'messages_sent'
    | 'voice_minutes'
    | 'reactions';
  category?: string | null;
  criteria?: Record<string, any>;
  reward_type?: 'xp' | 'tickets';
  reward_amount?: number;
  rewards?: Array<{ type: 'xp' | 'tickets'; amount: number }>;
  max_claims?: number | null;
  start_at?: string;
  end_at?: string | null;
  active?: boolean;
  is_daily?: boolean;
}

export class UpdateTaskDto {
  title?: string;
  description?: string;
  task_kind?: 'duration' | 'achievement' | 'test';
  achievement_type?:
    | 'cards_collected'
    | 'cards_favorited'
    | 'messages_sent'
    | 'voice_minutes'
    | 'reactions';
  category?: string | null;
  criteria?: Record<string, any>;
  reward_type?: 'xp' | 'tickets';
  reward_amount?: number;
  rewards?: Array<{ type: 'xp' | 'tickets'; amount: number }>;
  max_claims?: number | null;
  start_at?: string;
  end_at?: string | null;
  active?: boolean;
  is_daily?: boolean;
}
