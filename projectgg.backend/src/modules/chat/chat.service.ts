import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

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

export interface GgServer {
  id: number;
  name: string;
  owner_id: string;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string;
}

export interface GgChannel {
  id: number;
  server_id: number;
  name: string;
  type: 'text' | 'voice';
  position: number;
  created_at: string;
  allowed_roles?: string[];
}

export interface GgServerMember {
  server_id: number;
  user_id: string;
  roles: string[];
  joined_at: string;
  username?: string;
  avatar_url?: string;
  status?: string;
}

export type Permission = 'manage_server' | 'manage_channels' | 'manage_messages' | 'manage_members' | 'kick_members';

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  admin: 80,
  moderator: 60,
  member: 0,
};

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ['manage_server', 'manage_channels', 'manage_messages', 'manage_members', 'kick_members'],
  admin: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members'],
  moderator: ['manage_messages', 'kick_members'],
  member: [],
};

function getHighestRoleLevel(roles: string[] | null): number {
  if (!roles || roles.length === 0) return 0;
  return Math.max(...roles.map(r => ROLE_HIERARCHY[r] ?? 0));
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  private db() {
    return this.supabase.schema('projectgg');
  }

  async resolveSignedUrl(url: string | null): Promise<string | null> {
    if (!url) return null;
    const marker = '/storage/v1/object/';
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const rest = url.substring(idx + marker.length);
      const parts = rest.split('/');
      if (parts[0] === 'sign') {
        const bucket = parts[1];
        const path = parts.slice(2).join('/');
        const { data } = await this.supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
        return data?.signedUrl ?? url;
      }
      const bucket = parts[1];
      const path = parts.slice(2).join('/');
      const { data } = await this.supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
      return data?.signedUrl ?? url;
    }
    const { data } = await this.supabase.storage.from('chat_uploads').createSignedUrl(url, 60 * 60 * 24 * 7);
    return data?.signedUrl ?? url;
  }

  // ===== MESSAGES =====

  async getHistory(channelId?: string, limit = 50, userId?: string): Promise<ChatMessage[]> {
    let query = this.db().from('chat_messages').select('*');
    if (channelId) query = query.eq('channel_id', channelId);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    const messages = (data ?? []).reverse() as ChatMessage[];

    const replyToIds = messages.map(m => m.reply_to).filter((id): id is number => id != null);
    if (replyToIds.length > 0) {
      const { data: parentMessages } = await this.db()
        .from('chat_messages')
        .select('*')
        .in('id', replyToIds);
      const parentMap = new Map<number, ChatMessage>((parentMessages ?? []).map(m => [m.id, m as ChatMessage]));
      for (const msg of messages) {
        if (msg.reply_to != null) {
          msg.replyToMessage = parentMap.get(msg.reply_to) ?? null;
        }
      }
    }

    return messages;
  }

  async saveMessage(
    userId: string | number,
    username: string,
    content: string,
    channelId?: string,
    avatarUrl?: string,
    replyTo?: number,
    attachmentUrl?: string,
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
        reply_to: replyTo ?? null,
        attachment_url: attachmentUrl ?? null,
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
    const servers = (data ?? []).map((s: any) => s.gg_servers).filter(Boolean);
    for (const s of servers) {
      s.avatar_url = await this.resolveSignedUrl(s.avatar_url);
      s.banner_url = await this.resolveSignedUrl(s.banner_url);
    }
    return servers;
  }

  async getServer(serverId: number): Promise<GgServer | null> {
    const { data, error } = await this.db()
      .from('gg_servers')
      .select('*')
      .eq('id', serverId)
      .single();
    if (error) return null;
    if (data) {
      data.avatar_url = await this.resolveSignedUrl(data.avatar_url);
      data.banner_url = await this.resolveSignedUrl(data.banner_url);
    }
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
    {
      const memberPayload = {
        server_id: server.id,
        user_id: ownerId,
        joined_at: new Date().toISOString(),
        roles: ['owner'],
      };
      let { error: me } = await this.db().from('gg_server_members').insert(memberPayload);
      if (me?.code === 'PGRST204') {
        // PostgREST schema cache stale after column migration — retry once
        me = (await this.db().from('gg_server_members').insert(memberPayload)).error;
      }
      if (me) {
        await this.db().from('gg_servers').delete().eq('id', server.id);
        throw me;
      }
    }

    // Create default channels
    const { error: ce } = await this.db().from('gg_channels').insert([
      { server_id: server.id, name: 'general', type: 'text', position: 0 },
      { server_id: server.id, name: 'off-topic', type: 'text', position: 1 },
      { server_id: server.id, name: 'voice', type: 'voice', position: 2 },
    ]);
    if (ce) {
      // Cleanup server on channel creation failure
      await this.db().from('gg_server_members').delete().eq('server_id', server.id);
      await this.db().from('gg_servers').delete().eq('id', server.id);
      throw ce;
    }

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

  async updateServer(
    serverId: number, userId: string, data: Partial<Pick<GgServer, 'name' | 'avatar_url' | 'banner_url'>>,
  ): Promise<GgServer> {
    const { data: server } = await this.db()
      .from('gg_servers')
      .select('owner_id')
      .eq('id', serverId)
      .single();
    if (!server) throw new BadRequestException('Server not found');
    if (server.owner_id !== userId) throw new BadRequestException('Only the owner can update this server');
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;
    if (data.banner_url !== undefined) updateData.banner_url = data.banner_url;
    const { data: updated, error } = await this.db()
      .from('gg_servers')
      .update(updateData)
      .eq('id', serverId)
      .select()
      .single();
    if (error) throw error;
    if (updated) {
      updated.avatar_url = await this.resolveSignedUrl(updated.avatar_url);
      updated.banner_url = await this.resolveSignedUrl(updated.banner_url);
    }
    return updated;
  }

  // ===== SERVER ROLES =====

  async getServerRoles(serverId: number): Promise<any[]> {
    const { data, error } = await this.db()
      .from('gg_server_roles')
      .select('*')
      .eq('server_id', serverId)
      .order('position', { ascending: true });
    if (error) {
      const msg = (error.message ?? error.code ?? '') as string;
      if (error.code === '42P01' || error.code === '42703' || msg.includes('column') || msg.includes('schema cache')) {
        return [
          { name: 'owner', color: '#ffd700', is_owner: true, permissions: ['manage_server', 'manage_channels', 'manage_roles', 'manage_messages', 'manage_members', 'kick_members'] },
          { name: 'admin', color: '#ff4444', permissions: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members'] },
          { name: 'moderator', color: '#00f0ff', permissions: ['manage_messages', 'kick_members'] },
          { name: 'member', color: '#888888', permissions: [] },
        ];
      }
      throw error;
    }
    return data ?? [];
  }

  async createServerRole(serverId: number, userId: string, name: string, color?: string, permissions?: string[]): Promise<any> {
    const server = await this.db().from('gg_servers').select('owner_id').eq('id', serverId).single();
    if (!server.data || server.data.owner_id !== userId) throw new BadRequestException('Only the owner can create roles');
    const { data, error } = await this.db()
      .from('gg_server_roles')
      .insert({ server_id: serverId, name: name.trim(), color: color || '#00f0ff', permissions: permissions ?? [] })
      .select()
      .single();
    if (error) {
      const msg = (error.message ?? error.code ?? '') as string;
      if (error.code === '42P01' || error.code === '42703' || msg.includes('column') || msg.includes('schema cache')) {
        return { name: name.trim(), color: color || '#00f0ff', permissions: permissions ?? [] };
      }
      throw error;
    }
    return data;
  }

  async deleteServerRole(serverId: number, userId: string, roleName: string): Promise<void> {
    const server = await this.db().from('gg_servers').select('owner_id').eq('id', serverId).single();
    if (!server.data || server.data.owner_id !== userId) throw new BadRequestException('Only the owner can delete roles');
    const { error } = await this.db()
      .from('gg_server_roles')
      .delete()
      .eq('server_id', serverId)
      .eq('name', roleName);
    if (error && error.code !== '42P01' && !((error.message ?? '') as string).includes('schema cache')) throw error;
  }

  // ===== CHANNELS =====

  async getChannels(serverId: number, userId?: string): Promise<GgChannel[]> {
    const { data, error } = await this.db()
      .from('gg_channels')
      .select('*')
      .eq('server_id', serverId)
      .order('position', { ascending: true });
    if (error) throw error;
    let channels: GgChannel[] = data ?? [];

    // Attach allowed_roles and filter private channels
    const { data: chRoles } = await this.db()
      .from('gg_channel_allowed_roles')
      .select('channel_id, role')
      .in('channel_id', channels.map(c => c.id));
    const roleMap = new Map<number, string[]>();
    for (const cr of chRoles ?? []) {
      if (!roleMap.has(cr.channel_id)) roleMap.set(cr.channel_id, []);
      roleMap.get(cr.channel_id)!.push(cr.role);
    }

    channels = channels.map(ch => ({ ...ch, allowed_roles: roleMap.get(ch.id) ?? [] }));

    if (userId) {
      const userRoles = await this.getMemberRoles(serverId, userId);
      channels = channels.filter(ch => {
        if (!ch.allowed_roles || ch.allowed_roles.length === 0) return true;
        if (!userRoles || userRoles.length === 0) return false;
        return ch.allowed_roles.some(r => userRoles.includes(r));
      });
    }

    return channels;
  }

  async createChannel(
    serverId: number, name: string, type: 'text' | 'voice', userId: string, allowedRoles?: string[],
  ): Promise<GgChannel> {
    await this.requirePermission(serverId, userId, 'manage_channels');
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

    if (allowedRoles && allowedRoles.length > 0) {
      await this.setChannelRoles(data.id, allowedRoles);
    }

    return { ...data, allowed_roles: allowedRoles ?? [] };
  }

  async getChannelRoles(channelId: number): Promise<string[]> {
    const { data } = await this.db()
      .from('gg_channel_allowed_roles')
      .select('role')
      .eq('channel_id', channelId);
    return (data ?? []).map((r: any) => r.role);
  }

  async setChannelRoles(channelId: number, roles: string[]): Promise<void> {
    await this.db().from('gg_channel_allowed_roles').delete().eq('channel_id', channelId);
    if (roles.length > 0) {
      const { error } = await this.db().from('gg_channel_allowed_roles').insert(
        roles.map(r => ({ channel_id: channelId, role: r })),
      );
      if (error) throw error;
    }
  }

  async deleteChannel(channelId: number, userId: string): Promise<void> {
    const { data: ch } = await this.db().from('gg_channels').select('server_id').eq('id', channelId).single();
    if (!ch) throw new BadRequestException('Channel not found');
    await this.requirePermission(ch.server_id, userId, 'manage_channels');
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
    const members = data ?? [];
    if (members.length === 0) return [];

    const userIds = members.map(m => m.user_id);
    const { data: users } = await this.db()
      .from('users')
      .select('id, username, avatar, gender, status, sys_status')
      .in('id', userIds);
    const userMap = new Map<string, any>((users ?? []).map((u: any) => [u.id, u]));

    return members.map(m => {
      const user = userMap.get(m.user_id);
      const status = user?.status ?? user?.sys_status ?? 'invisible';
      return {
        ...m,
        username: user?.username ?? m.username ?? m.user_id,
        avatar_url: user ? this.resolveAvatar(user.avatar, user.gender) : null,
        status,
      };
    });
  }

  async joinServer(serverId: number, userId: string): Promise<void> {
    const { data: existing } = await this.db()
      .from('gg_server_members')
      .select('*')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .single();
    if (existing) return;
    const memberPayload = {
      server_id: serverId,
      user_id: userId,
      joined_at: new Date().toISOString(),
      roles: ['member'],
    };
    let { error } = await this.db()
      .from('gg_server_members')
      .insert(memberPayload);
    if (error?.code === 'PGRST204') {
      error = (await this.db().from('gg_server_members').insert(memberPayload)).error;
    }
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
      .select('roles')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .single();
    if (!data) throw new BadRequestException('Not a member of this server');
  }

  async getMemberRoles(serverId: number, userId: string): Promise<string[] | null> {
    const { data } = await this.db()
      .from('gg_server_members')
      .select('roles')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .single();
    return data?.roles ?? null;
  }

  hasPermission(roles: string[] | null, permission: Permission): boolean {
    if (!roles || roles.length === 0) return false;
    return roles.some(r => ROLE_PERMISSIONS[r]?.includes(permission) ?? false);
  }

  async requirePermission(serverId: number, userId: string, permission: Permission): Promise<void> {
    const { data } = await this.db()
      .from('gg_server_members')
      .select('roles')
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .single();
    if (!data) throw new BadRequestException('Not a member of this server');
    if (!this.hasPermission(data.roles, permission)) {
      throw new BadRequestException(`Missing permission: ${permission}`);
    }
  }

  async changeMemberRoles(serverId: number, targetUserId: string, newRoles: string[], requesterId: string): Promise<void> {
    await this.requirePermission(serverId, requesterId, 'manage_members');
    if (newRoles.some(r => !['admin', 'moderator', 'member'].includes(r))) {
      throw new BadRequestException('Invalid role. Allowed: admin, moderator, member');
    }
    const requesterRoles = await this.getMemberRoles(serverId, requesterId);
    const targetRoles = await this.getMemberRoles(serverId, targetUserId);
    if (!targetRoles) throw new BadRequestException('Target user not found in server');
    if (targetRoles.includes('owner')) throw new BadRequestException('Cannot change owner roles');
    if (getHighestRoleLevel(requesterRoles) <= getHighestRoleLevel(targetRoles)) {
      throw new BadRequestException('Cannot change roles of someone with equal or higher rank');
    }
    const { error } = await this.db()
      .from('gg_server_members')
      .update({ roles: newRoles })
      .eq('server_id', serverId)
      .eq('user_id', targetUserId);
    if (error) throw error;
  }

  async kickMember(serverId: number, targetUserId: string, requesterId: string): Promise<void> {
    await this.requirePermission(serverId, requesterId, 'kick_members');
    if (targetUserId === requesterId) throw new BadRequestException('Cannot kick yourself');
    const targetRoles = await this.getMemberRoles(serverId, targetUserId);
    if (!targetRoles) throw new BadRequestException('User not found in server');
    if (targetRoles.includes('owner')) throw new BadRequestException('Cannot kick the owner');
    const requesterRoles = await this.getMemberRoles(serverId, requesterId);
    if (getHighestRoleLevel(requesterRoles) <= getHighestRoleLevel(targetRoles)) {
      throw new BadRequestException('Cannot kick someone with equal or higher rank');
    }
    const { error } = await this.db()
      .from('gg_server_members')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', targetUserId);
    if (error) throw error;
  }

  async banMember(serverId: number, targetUserId: string, requesterId: string): Promise<void> {
    await this.requirePermission(serverId, requesterId, 'kick_members');
    if (targetUserId === requesterId) throw new BadRequestException('Cannot ban yourself');
    const targetRoles = await this.getMemberRoles(serverId, targetUserId);
    if (!targetRoles) throw new BadRequestException('User not found in server');
    if (targetRoles.includes('owner')) throw new BadRequestException('Cannot ban the owner');
    const requesterRoles = await this.getMemberRoles(serverId, requesterId);
    if (getHighestRoleLevel(requesterRoles) <= getHighestRoleLevel(targetRoles)) {
      throw new BadRequestException('Cannot ban someone with equal or higher rank');
    }
    // Remove from server
    await this.db()
      .from('gg_server_members')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', targetUserId);
    // Add to banned list
    const { error } = await this.db()
      .from('banned_users')
      .insert({ user_id: serverId, blocked_user_id: targetUserId })
      .select()
      .single();
    if (error && !error.message?.includes('duplicate')) throw error;
  }

  async unbanMember(serverId: number, targetUserId: string, requesterId: string): Promise<void> {
    await this.requirePermission(serverId, requesterId, 'kick_members');
    const { error } = await this.db()
      .from('banned_users')
      .delete()
      .eq('user_id', serverId)
      .eq('blocked_user_id', targetUserId);
    if (error) throw error;
  }

  async getBannedMembers(serverId: number, requesterId: string): Promise<any[]> {
    await this.requirePermission(serverId, requesterId, 'kick_members');
    const { data, error } = await this.db()
      .from('banned_users')
      .select('blocked_user_id, created_at')
      .eq('user_id', serverId);
    if (error) throw error;
    if (!data || data.length === 0) return [];
    const userIds = data.map((d: any) => d.blocked_user_id);
    const { data: users } = await this.db()
      .from('users')
      .select('id, username, avatar')
      .in('id', userIds);
    const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
    return data.map((d: any) => ({
      user_id: d.blocked_user_id,
      banned_at: d.created_at,
      username: userMap.get(d.blocked_user_id)?.username ?? null,
      avatar: userMap.get(d.blocked_user_id)?.avatar ?? null,
    }));
  }

  // ================================================================
  // INVITE LINKS
  // ================================================================

  async generateInvite(serverId: number, userId: string): Promise<any> {
    await this.requirePermission(serverId, userId, 'manage_server');

    const crypto = require('crypto');
    const code = crypto.randomBytes(4).toString('hex');

    // Revoke all previous non-revoked invites for this server
    await this.db()
      .from('invite_links')
      .update({ revoked: true })
      .eq('server_id', serverId)
      .eq('revoked', false);

    const { data, error } = await this.db()
      .from('invite_links')
      .insert({ server_id: serverId, code, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getServerInvites(serverId: number): Promise<any[]> {
    const { data, error } = await this.db()
      .from('invite_links')
      .select('*')
      .eq('server_id', serverId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async revokeInvite(inviteId: number, userId: string): Promise<void> {
    const { data: invite } = await this.db()
      .from('invite_links')
      .select('server_id')
      .eq('id', inviteId)
      .single();
    if (!invite) throw new BadRequestException('Invite not found');
    await this.requirePermission(invite.server_id, userId, 'manage_server');

    const { error } = await this.db()
      .from('invite_links')
      .update({ revoked: true })
      .eq('id', inviteId);
    if (error) throw error;
  }

  async joinViaInvite(code: string, userId: string): Promise<number> {
    const { data: invite } = await this.db()
      .from('invite_links')
      .select('*')
      .eq('code', code)
      .single();
    if (!invite) throw new BadRequestException('Invalid invite code');
    if (invite.revoked) throw new BadRequestException('Invite link has been revoked');
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new BadRequestException('Invite link has expired');
    }
    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      throw new BadRequestException('Invite link has reached max uses');
    }

    await this.joinServer(invite.server_id, userId);

    // Increment use count
    await this.db()
      .from('invite_links')
      .update({ use_count: invite.use_count + 1 })
      .eq('id', invite.id);

    return invite.server_id;
  }

  // ================================================================
  // FRIENDS
  // ================================================================

  private resolveAvatar(avatar: string | null, gender: string | null): string {
    if (avatar) return avatar;
    const g = gender?.toLowerCase();
    if (g === 'male') return '/assets/avatars/male.png';
    if (g === 'female') return '/assets/avatars/female.png';
    return '/assets/avatars/unknown.png';
  }

  async findUserById(id: string): Promise<any> {
    const { data, error } = await this.db()
      .from('users')
      .select('id, username, avatar, name, gender, status, sys_status')
      .eq('id', id)
      .single();
    if (error) return null;
    return { ...data, avatar: this.resolveAvatar(data.avatar, data.gender) };
  }

  async searchUsers(query: string, excludeUserId: string): Promise<any[]> {
    const { data, error } = await this.db()
      .from('users')
      .select('id, username, avatar, name, gender, status, sys_status')
      .ilike('username', `%${query}%`)
      .neq('id', excludeUserId)
      .limit(20);
    if (error) throw error;
    return (data ?? []).map(u => ({ ...u, avatar: this.resolveAvatar(u.avatar, u.gender) }));
  }

  async getUserPublicById(userId: string): Promise<any> {
    const { data, error } = await this.db()
      .from('users')
      .select('id, username, avatar, name, gender, status, sys_status')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, avatar: this.resolveAvatar(data.avatar, data.gender) };
  }

  async sendFriendRequest(userId: string, friendUsername: string): Promise<any> {
    const { data: friend } = await this.db()
      .from('users')
      .select('id')
      .eq('username', friendUsername)
      .single();
    if (!friend) throw new BadRequestException('User not found');
    if (friend.id === userId) throw new BadRequestException('Cannot add yourself');

    const { data: existing } = await this.db()
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${userId},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${userId})`)
      .maybeSingle();
    if (existing) {
      if (existing.status === 'accepted') throw new BadRequestException('Already friends');
      if (existing.status === 'pending') throw new BadRequestException('Friend request already sent');
      throw new BadRequestException('Cannot send friend request');
    }

    const { data, error } = await this.db()
      .from('friends')
      .insert({ user_id: userId, friend_id: friend.id, status: 'pending', action_user_id: userId })
      .select()
      .single();
    if (error) throw error;

    return { ...data, friendUsername: friendUsername };
  }

  async acceptFriendRequest(userId: string, friendId: number): Promise<void> {
    const { data } = await this.db()
      .from('friends')
      .select('*')
      .eq('id', friendId)
      .single();
    if (!data) throw new BadRequestException('Friend request not found');
    if (data.friend_id !== userId) throw new BadRequestException('Not your request');

    const { error } = await this.db()
      .from('friends')
      .update({ status: 'accepted' })
      .eq('id', friendId);
    if (error) throw error;
  }

  async removeFriend(userId: string, friendRowId: number): Promise<void> {
    const { data } = await this.db()
      .from('friends')
      .select('*')
      .eq('id', friendRowId)
      .single();
    if (!data) throw new BadRequestException('Friend not found');
    if (data.user_id !== userId && data.friend_id !== userId) {
      throw new BadRequestException('Not your friend');
    }
    const { error } = await this.db()
      .from('friends')
      .delete()
      .eq('id', friendRowId);
    if (error) throw error;
  }

  async getFriends(userId: string): Promise<any[]> {
    const { data: asUser, error: err1 } = await this.db()
      .from('friends')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'accepted');
    if (err1) throw err1;
    const { data: asFriend, error: err2 } = await this.db()
      .from('friends')
      .select('*')
      .eq('friend_id', userId)
      .eq('status', 'accepted');
    if (err2) throw err2;
    return [...(asUser ?? []), ...(asFriend ?? [])];
  }

  async getPendingRequests(userId: string): Promise<any[]> {
    const { data, error } = await this.db()
      .from('friends')
      .select('*')
      .eq('friend_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return data ?? [];
  }

  async getPendingSentRequests(userId: string): Promise<any[]> {
    const { data, error } = await this.db()
      .from('friends')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return data ?? [];
  }

  // ================================================================
  // DM CONVERSATIONS
  // ================================================================

  async getDmConversations(userId: string): Promise<any[]> {
    const { data, error } = await this.db()
      .from('dm_conversation_members')
      .select('conversation_id, dm_conversations(*)')
      .eq('user_id', userId);
    if (error) throw error;

    const conversations = (data ?? []).map((m: any) => m.dm_conversations).filter(Boolean);

    for (const conv of conversations) {
      const { data: members } = await this.db()
        .from('dm_conversation_members')
        .select('user_id')
        .eq('conversation_id', conv.id)
        .neq('user_id', userId);
      conv.otherUserId = members?.[0]?.user_id ?? null;
      if (conv.otherUserId) {
        const other = await this.findUserById(conv.otherUserId);
        conv.otherUsername = other?.username ?? 'Unknown';
        conv.otherAvatar = other?.avatar ?? null;
        conv.otherStatus = other?.status ?? other?.sys_status ?? 'invisible';
      }

      const { data: lastMsg } = await this.db()
        .from('chat_messages')
        .select('content, created_at')
        .eq('channel_id', `dm_${conv.id}`)
        .order('created_at', { ascending: false })
        .limit(1);
      conv.lastMessage = lastMsg?.[0]?.content ?? null;
      conv.lastMessageAt = lastMsg?.[0]?.created_at ?? null;
    }

    conversations.sort((a: any, b: any) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    return conversations;
  }

  async createDmConversation(userId: string, otherUserId: string): Promise<any> {
    if (userId === otherUserId) throw new BadRequestException('Cannot DM yourself');

    const { data: existing } = await this.db()
      .from('dm_conversation_members')
      .select('conversation_id')
      .eq('user_id', userId);
    const userConvIds = (existing ?? []).map((m: any) => m.conversation_id);

    if (userConvIds.length > 0) {
      const { data: otherMember } = await this.db()
        .from('dm_conversation_members')
        .select('conversation_id')
        .in('conversation_id', userConvIds)
        .eq('user_id', otherUserId)
        .maybeSingle();
      if (otherMember) {
        const { data: conv } = await this.db()
          .from('dm_conversations')
          .select('*')
          .eq('id', otherMember.conversation_id)
          .single();
        return conv;
      }
    }

    const { data: conv, error: ce } = await this.db()
      .from('dm_conversations')
      .insert({ type: 'dm' })
      .select()
      .single();
    if (ce) throw ce;

    await this.db().from('dm_conversation_members').insert([
      { conversation_id: conv.id, user_id: userId },
      { conversation_id: conv.id, user_id: otherUserId },
    ]);

    return conv;
  }

  async getDmHistory(conversationId: number, limit = 50): Promise<ChatMessage[]> {
    const channelId = `dm_${conversationId}`;
    let query = this.db().from('chat_messages').select('*').eq('channel_id', channelId);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    const messages = (data ?? []).reverse() as ChatMessage[];

    const replyToIds = messages.map(m => m.reply_to).filter((id): id is number => id != null);
    if (replyToIds.length > 0) {
      const { data: parentMessages } = await this.db()
        .from('chat_messages')
        .select('*')
        .in('id', replyToIds);
      const parentMap = new Map<number, ChatMessage>((parentMessages ?? []).map(m => [m.id, m as ChatMessage]));
      for (const msg of messages) {
        if (msg.reply_to != null) {
          msg.replyToMessage = parentMap.get(msg.reply_to) ?? null;
        }
      }
    }

    return messages;
  }

  async sendDmMessage(
    userId: string,
    content: string,
    conversationId: number,
    replyTo?: number,
    attachmentUrl?: string,
  ): Promise<ChatMessage> {
    const user = userId ? await this.findUserById(userId) : null;
    const username = user?.username ?? 'Unknown';
    const avatarUrl = user?.avatar ?? null;
    const channelId = `dm_${conversationId}`;

    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > 500) throw new BadRequestException('Message too long (max 500)');

    const { data, error } = await this.db()
      .from('chat_messages')
      .insert({
        user_id: null,
        username,
        content: trimmed,
        source: 'web',
        channel_id: channelId,
        avatar_url: avatarUrl,
        reply_to: replyTo ?? null,
        attachment_url: attachmentUrl ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ===== NOTIFICATIONS =====

  async createNotification(
    userId: string, type: string, title: string, body?: string, data?: any,
  ): Promise<any> {
    const { data: notif, error } = await this.db()
      .from('notifications')
      .insert({ user_id: userId, type, title, body: body ?? '', data: data ?? null })
      .select()
      .single();
    if (error) throw error;
    return notif;
  }

  async getNotifications(userId: string): Promise<any[]> {
    const { data, error } = await this.db()
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }

  async markNotificationRead(notificationId: number): Promise<void> {
    const { error } = await this.db()
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    if (error) throw error;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const { error } = await this.db()
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
  }

  async clearAllNotifications(userId: string): Promise<void> {
    const { error } = await this.db()
      .from('notifications')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  }

  async deleteNotification(userId: string, notificationId: number): Promise<void> {
    const { error } = await this.db()
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  // ===== FRIEND REQUEST REJECT / CANCEL =====

  async rejectFriendRequest(userId: string, requestId: number): Promise<void> {
    const { data } = await this.db()
      .from('friends')
      .select('*')
      .eq('id', requestId)
      .single();
    if (!data) throw new BadRequestException('Friend request not found');
    if (data.friend_id !== userId) throw new BadRequestException('Not your request');
    await this.db().from('friends').delete().eq('id', requestId);
  }

  async cancelFriendRequest(userId: string, requestId: number): Promise<void> {
    const { data } = await this.db()
      .from('friends')
      .select('*')
      .eq('id', requestId)
      .single();
    if (!data) throw new BadRequestException('Friend request not found');
    if (data.user_id !== userId) throw new BadRequestException('Not your request');
    await this.db().from('friends').delete().eq('id', requestId);
  }

  // ================================================================
  // BLOCKING
  // ================================================================

  async blockUser(userId: string, blockUserId: string): Promise<void> {
    if (userId === blockUserId) throw new BadRequestException('Cannot block yourself');
    
    const { error: insertError } = await this.db()
      .from('blocked_users')
      .insert({ user_id: userId, blocked_user_id: blockUserId });
    if (insertError) {
      if (insertError.code === '23505') {
        // Already blocked, that's fine
        return;
      }
      throw insertError;
    }
  }

  async unblockUser(userId: string, blockUserId: string): Promise<void> {
    const { error } = await this.db()
      .from('blocked_users')
      .delete()
      .eq('user_id', userId)
      .eq('blocked_user_id', blockUserId);
    if (error) throw error;
  }

  async getBlockedUsers(userId: string): Promise<any[]> {
    const { data, error } = await this.db()
      .from('blocked_users')
      .select('blocked_user_id')
      .eq('user_id', userId);
    if (error) throw error;
    
    const blockedUserIds = (data ?? []).map((r: any) => r.blocked_user_id);
    if (blockedUserIds.length === 0) return [];

    const { data: users, error: userError } = await this.db()
      .from('users')
      .select('id, username, avatar, status, sys_status')
      .in('id', blockedUserIds);
    if (userError) throw userError;

    return (users ?? []).map((u: any) => ({
      id: u.id,
      other_id: u.id,
      other_username: u.username,
      other_avatar: u.avatar,
      status: u.status,
    }));
  }

  // ================================================================
  // DM OPERATIONS
  // ================================================================

  async deleteDmConversation(userId: string, conversationId: number): Promise<void> {
    // Verify user is part of this conversation
    const { data: member } = await this.db()
      .from('dm_conversation_members')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (!member) throw new BadRequestException('Not part of this conversation');

    // Delete the conversation member entry
    const { error: deleteError } = await this.db()
      .from('dm_conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Check if there are any remaining members
    const { data: remainingMembers } = await this.db()
      .from('dm_conversation_members')
      .select('*')
      .eq('conversation_id', conversationId);

    // If no members left, delete the conversation
    if (!remainingMembers || remainingMembers.length === 0) {
      await this.db()
        .from('dm_conversations')
        .delete()
        .eq('id', conversationId);
    }
  }

  // ================================================================
  // MESSAGE EDIT / DELETE
  // ================================================================

  async editMessage(messageId: number, userId: string, content: string): Promise<any> {
    const { data: msg } = await this.db()
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .single();
    if (!msg) throw new BadRequestException('Message not found');
    if (msg.user_id !== userId) throw new BadRequestException('You can only edit your own messages');

    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > 500) throw new BadRequestException('Message too long (max 500)');

    const { data: updated, error } = await this.db()
      .from('chat_messages')
      .update({ content: trimmed, edited: true })
      .eq('id', messageId)
      .select()
      .single();
    if (error) throw error;
    return updated;
  }

  async deleteMessage(messageId: number, userId: string): Promise<void> {
    const { data: msg } = await this.db()
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .single();
    if (!msg) throw new BadRequestException('Message not found');

    const { error } = await this.db()
      .from('chat_messages')
      .delete()
      .eq('id', messageId);
    if (error) throw error;
  }

  // ================================================================
  // ROLE EDIT
  // ================================================================

  async updateServerRole(
    serverId: number, userId: string, roleName: string, data: { name?: string; color?: string; permissions?: string[] },
  ): Promise<any> {
    const { data: server } = await this.db()
      .from('gg_servers')
      .select('owner_id, roles')
      .eq('id', serverId)
      .single();
    if (!server) throw new BadRequestException('Server not found');
    if (server.owner_id !== userId) throw new BadRequestException('Only the owner can edit roles');

    const roles = (server.roles ?? []) as any[];
    const idx = roles.findIndex((r: any) => r.name === roleName);
    if (idx === -1) throw new BadRequestException('Role not found');

    if (data.name !== undefined) roles[idx].name = data.name;
    if (data.color !== undefined) roles[idx].color = data.color;
    if (data.permissions !== undefined) roles[idx].permissions = data.permissions;

    const { data: updated, error } = await this.db()
      .from('gg_servers')
      .update({ roles })
      .eq('id', serverId)
      .select()
      .single();
    if (error) throw error;
    return updated;
  }
}
