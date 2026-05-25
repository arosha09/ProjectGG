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
  avatar_url?: string;
  created_at: string;
}

export interface GgServer {
  id: number;
  name: string;
  owner_id: string;
  avatar_url: string | null;
  created_at: string;
}

export interface GgChannel {
  id: number;
  server_id: number;
  name: string;
  type: 'text' | 'voice';
  position: number;
  created_at: string;
}

export interface GgServerMember {
  server_id: number;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  username?: string;
  avatar_url?: string;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  private db() {
    return this.supabase.schema('projectgg');
  }

  // ===== MESSAGES =====

  async getHistory(channelId?: string, limit = 50): Promise<ChatMessage[]> {
    let query = this.db().from('chat_messages').select('*');
    if (channelId) query = query.eq('channel_id', channelId);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).reverse();
  }

  async saveMessage(
    userId: number,
    username: string,
    content: string,
    channelId?: string,
    avatarUrl?: string,
  ): Promise<ChatMessage> {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > 500) throw new BadRequestException('Message too long (max 500)');
    const { data, error } = await this.db()
      .from('chat_messages')
      .insert({
        user_id: userId,
        username,
        content: trimmed,
        source: 'web',
        channel_id: channelId ?? null,
        avatar_url: avatarUrl ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ===== SERVERS =====

  async getServers(userId: string): Promise<GgServer[]> {
    const { data, error } = await this.db()
      .from('gg_server_members')
      .select('server_id, gg_servers(*)')
      .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map((s: any) => s.gg_servers).filter(Boolean);
  }

  async getServer(serverId: number): Promise<GgServer | null> {
    const { data, error } = await this.db()
      .from('gg_servers')
      .select('*')
      .eq('id', serverId)
      .single();
    if (error) return null;
    return data;
  }

  async createServer(name: string, ownerId: string): Promise<GgServer> {
    const { data: server, error: se } = await this.db()
      .from('gg_servers')
      .insert({ name, owner_id: ownerId })
      .select()
      .single();
    if (se) throw se;

    // Add owner as member
    await this.db().from('gg_server_members').insert({
      server_id: server.id,
      user_id: ownerId,
      role: 'owner',
    });

    // Create default channels
    await this.db().from('gg_channels').insert([
      { server_id: server.id, name: 'general', type: 'text', position: 0 },
      { server_id: server.id, name: 'off-topic', type: 'text', position: 1 },
      { server_id: server.id, name: 'voice', type: 'voice', position: 2 },
    ]);

    return server;
  }

  async deleteServer(serverId: number, userId: string): Promise<void> {
    const { data: server } = await this.db()
      .from('gg_servers')
      .select('owner_id')
      .eq('id', serverId)
      .single();
    if (!server || server.owner_id !== userId) {
      throw new BadRequestException('Only the owner can delete this server');
    }
    const { error } = await this.db().from('gg_servers').delete().eq('id', serverId);
    if (error) throw error;
  }

  // ===== CHANNELS =====

  async getChannels(serverId: number): Promise<GgChannel[]> {
    const { data, error } = await this.db()
      .from('gg_channels')
      .select('*')
      .eq('server_id', serverId)
      .order('position', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async createChannel(serverId: number, name: string, type: 'text' | 'voice', userId: string): Promise<GgChannel> {
    await this.requireServerAccess(serverId, userId);
    const { data: channels } = await this.db()
      .from('gg_channels')
      .select('position')
      .eq('server_id', serverId)
      .order('position', { ascending: false })
      .limit(1);
    const nextPos = ((channels ?? [])[0]?.position ?? -1) + 1;
    const { data, error } = await this.db()
      .from('gg_channels')
      .insert({ server_id: serverId, name, type, position: nextPos })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteChannel(channelId: number, userId: string): Promise<void> {
    const { data: ch } = await this.db().from('gg_channels').select('server_id').eq('id', channelId).single();
    if (!ch) throw new BadRequestException('Channel not found');
    await this.requireServerAccess(ch.server_id, userId);
    const { error } = await this.db().from('gg_channels').delete().eq('id', channelId);
    if (error) throw error;
  }

  // ===== MEMBERS =====

  async getServerMembers(serverId: number): Promise<GgServerMember[]> {
    const { data, error } = await this.db()
      .from('gg_server_members')
      .select('*')
      .eq('server_id', serverId);
    if (error) throw error;
    return data ?? [];
  }

  async joinServer(serverId: number, userId: string): Promise<void> {
    const { data: existing } = await this.db()
      .from('gg_server_members')
      .select('*')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .single();
    if (existing) return; // already a member
    const { error } = await this.db()
      .from('gg_server_members')
      .insert({ server_id: serverId, user_id: userId, role: 'member' });
    if (error) throw error;
  }

  async leaveServer(serverId: number, userId: string): Promise<void> {
    const { error } = await this.db()
      .from('gg_server_members')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  private async requireServerAccess(serverId: number, userId: string): Promise<void> {
    const { data } = await this.db()
      .from('gg_server_members')
      .select('role')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .single();
    if (!data) throw new BadRequestException('Not a member of this server');
  }
}
