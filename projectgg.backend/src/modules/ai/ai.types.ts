export interface ChatMessage {
  id: number;
  user_id: string | number | null;
  username: string;
  content: string;
  source: string;
  channel_id?: string;
  channel_name?: string;
  guild_name?: string;
  channel_type?: string;
  avatar_url?: string;
  created_at: string;
  reply_to?: number | null;
  attachment_url?: string | null;
  sticker_url?: string | null;
  discord_message_id?: string | null;
  [key: string]: any;
}

export interface VoiceFingerprint {
  pitch: { min: number; max: number; avg: number };
  tone: { brightness: number; warmth: number };
  speakingRate: number;
  formants: number[];
}

export interface VoiceProfile {
  id: string;
  user_id: string;
  voice_fingerprint: VoiceFingerprint;
  custom_vocabulary: string[];
  training_completed: boolean;
  training_count: number;
  trained_at: string | null;
  wake_word_enabled: boolean;
  custom_wake_phrase: string;
  created_at: string;
  updated_at: string;
}

export interface ApexContext {
  messages: ChatMessage[];
  isVerified: boolean;
  customVocabulary: string[];
  userId: string;
  channelId: string;
}

export interface AiResponse {
  success: boolean;
  content?: string;
  error?: string;
  cached?: boolean;
}

export interface RateLimitConfig {
  userLimit: number;
  userWindowMs: number;
  channelLimit: number;
  channelWindowMs: number;
}
