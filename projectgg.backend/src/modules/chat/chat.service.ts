import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

export interface ChatMessage {
  id: number;
  user_id: number | null;
  username: string;
  content: string;
  source: string;
  channel_id?: string;
  channel_name?: string;
  channel_type?: string;
  guild_name?: string;
  created_at: string;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  async getHistory(channelId?: string, limit = 50): Promise<ChatMessage[]> {
    let query = this.supabase
      .schema('projectgg')
      .from('chat_messages')
      .select('*');

    if (channelId) {
      query = query.eq('channel_id', channelId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).reverse();
  }

  async saveMessage(
    userId: number,
    username: string,
    content: string,
    channelId?: string,
  ): Promise<ChatMessage> {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > 500) throw new BadRequestException('Message too long (max 500)');

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('chat_messages')
      .insert({
        user_id: userId,
        username,
        content: trimmed,
        source: 'web',
        channel_id: channelId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
