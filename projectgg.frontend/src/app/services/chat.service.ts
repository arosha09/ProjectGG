import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

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
  category?: string;
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

export interface DmConversation {
  id: number;
  type: string;
  name: string | null;
  created_at: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatar: string | null;
  otherStatus?: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

  // ===== FRIEND / MEMBER DETAILS =====

export interface FriendUser {
  id: number;
  other_id: string;
  other_username: string;
  other_avatar: string | null;
  status: string;
  gender?: string | null;
  other_name?: string | null;
  blocked?: boolean;
}

export interface FriendsData {
  accepted: FriendUser[];
  pending: FriendUser[];
  sent: FriendUser[];
}

export interface AppNotification {
  id: number;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  created_at: string;
}

export interface DrawCard {
  game_code: string;
  game_name: string;
  cover_url: string;
  rating: number;
  card_tier: string;
  series_name: string;
  desc?: string | null;
  release_year?: number | null;
  source?: string | null;
}

export interface DrawResult {
  game_code: string;
  game_name: string;
  cover_url: string;
  rating: number;
  card_tier: string;
  series_name: string;
  desc?: string | null;
  release_year?: number | null;
  source?: string | null;
  is_new: boolean;
  xp_awarded: number;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly apiUrl = environment.apiUrl;
  private socket: Socket | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  connect(): Socket {
    if (!this.socket) {
      const wsUrl = environment.apiUrl.replace(/\/api\/?$/, '');
      const user = this.auth.getCurrentUser();
      this.socket = io(`${wsUrl}/chat`, {
        transports: ['polling', 'websocket'],
        query: { userId: user?.id ?? '' },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
        reconnectionAttempts: Infinity,
      });
    }
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  // ===== DISCORD-RELATED (original, unchanged) =====
  getHistory(limit = 50): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/chat/history?limit=${limit}`);
  }

  sendMessage(content: string, channelId?: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/chat/send`, { content, channel_id: channelId });
  }

  // ===== GG CHAT SERVERS =====
  getServers(): Observable<GgServer[]> {
    return this.http.get<GgServer[]>(`${this.apiUrl}/gg/servers`);
  }

  createServer(name: string): Observable<GgServer> {
    return this.http.post<GgServer>(`${this.apiUrl}/gg/servers`, { name });
  }

  deleteServer(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/servers/${id}`);
  }

  // ===== GG CHAT CHANNELS =====
  getChannels(serverId: number): Observable<GgChannel[]> {
    return this.http.get<GgChannel[]>(`${this.apiUrl}/gg/servers/${serverId}/channels`);
  }

  createChannel(serverId: number, name: string, type: 'text' | 'voice', allowed_roles?: string[], category?: string): Observable<GgChannel> {
    return this.http.post<GgChannel>(`${this.apiUrl}/gg/servers/${serverId}/channels`, { name, type, allowed_roles, category });
  }

  deleteChannel(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/channels/${id}`);
  }

  getChannelRoles(channelId: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/gg/channels/${channelId}/roles`);
  }

  setChannelRoles(channelId: number, roles: string[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/channels/${channelId}/roles`, { roles });
  }

  setChannelCategory(channelId: number, category: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/channels/${channelId}/category`, { category });
  }

  // ===== CATEGORIES =====
  getCategories(serverId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/gg/servers/${serverId}/categories`);
  }

  createCategory(serverId: number, name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/categories`, { name });
  }

  updateCategory(categoryId: number, data: { name?: string; sort_order?: number }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/categories/${categoryId}`, data);
  }

  deleteCategory(categoryId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/categories/${categoryId}`);
  }

  setCategoryRoles(categoryId: number, roles: string[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/categories/${categoryId}/roles`, { roles });
  }

  reorderCategories(serverId: number, orderedIds: number[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/servers/${serverId}/categories/reorder`, { orderedIds });
  }

  moveChannelToCategory(channelId: number, category: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/channels/${channelId}/move`, { category });
  }

  reorderChannels(serverId: number, orderedIds: number[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/servers/${serverId}/channels/reorder`, { orderedIds });
  }

  // ===== GG SERVER PROFILES =====
  getServerProfile(serverId: number, userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/gg/servers/${serverId}/profile/${userId}`);
  }

  getServerProfiles(serverId: number): Observable<{ user_id: string; avatar_url: string | null; banner_url: string | null }[]> {
    return this.http.get<{ user_id: string; avatar_url: string | null; banner_url: string | null }[]>(`${this.apiUrl}/gg/servers/${serverId}/profiles`);
  }

  updateServerProfile(serverId: number, data: { avatar_url?: string; banner_url?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/gg/servers/${serverId}/profile`, data);
  }

  uploadServerProfileAvatar(serverId: number, file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/gg/servers/${serverId}/profile/avatar`, fd);
  }

  uploadServerProfileBanner(serverId: number, file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/gg/servers/${serverId}/profile/banner`, fd);
  }

  deleteServerProfileAvatar(serverId: number): Observable<any> {
    return this.updateServerProfile(serverId, { avatar_url: '' });
  }

  deleteServerProfileBanner(serverId: number): Observable<any> {
    return this.updateServerProfile(serverId, { banner_url: '' });
  }

  // ===== GG CHAT MEMBERS =====
  getServerMembers(serverId: number): Observable<GgServerMember[]> {
    return this.http.get<GgServerMember[]>(`${this.apiUrl}/gg/servers/${serverId}/members`);
  }

  joinServer(serverId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/join`, {});
  }

  leaveServer(serverId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/leave`, {});
  }

  // ===== GG CHAT MESSAGES =====
  getGgHistory(channelId: string, limit = 50): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/gg/history?channel=${channelId}&limit=${limit}`);
  }

  sendGgMessage(content: string, channelId: string, attachmentUrl?: string, replyTo?: number): Observable<ChatMessage> {
    const body: any = { content, channel_id: channelId };
    if (attachmentUrl) body.attachment_url = attachmentUrl;
    if (replyTo != null) body.reply_to = replyTo;
    return this.http.post<ChatMessage>(`${this.apiUrl}/gg/send`, body);
  }

  editGgMessage(messageId: number, content: string): Observable<ChatMessage> {
    return this.http.patch<ChatMessage>(`${this.apiUrl}/gg/messages/${messageId}`, { content });
  }

  deleteGgMessage(messageId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/messages/${messageId}`);
  }

  uploadFile(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/chat/upload`, fd);
  }

  searchGifs(query = ''): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/chat/gifs`, {
      params: query ? { q: query } : {},
    });
  }

  // ===== ROLE MANAGEMENT =====
  changeMemberRoles(serverId: number, memberId: string, roles: string[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/servers/${serverId}/members/${memberId}/roles`, { roles });
  }

  kickMember(serverId: number, memberId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/members/${memberId}/kick`, {});
  }

  banMember(serverId: number, memberId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/members/${memberId}/ban`, {});
  }

  unbanMember(serverId: number, memberId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/servers/${serverId}/bans/${memberId}`);
  }

  getBannedMembers(serverId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/gg/servers/${serverId}/bans`);
  }

  getServerRoles(serverId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/gg/servers/${serverId}/roles`);
  }

  createServerRole(serverId: number, name: string, color?: string, permissions?: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/roles`, { name, color, permissions });
  }

  deleteServerRole(serverId: number, roleName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/servers/${serverId}/roles/${roleName}`);
  }

  updateServerRole(serverId: number, roleName: string, data: { name?: string; color?: string; permissions?: string[] }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/servers/${serverId}/roles/${roleName}`, data);
  }

  emitStatus(status: string, explicit = false): void {
    if (this.socket) {
      this.socket.emit('status-change', { status, explicit });
    }
  }

  emitTyping(channelId: string, username: string): void {
    if (this.socket) {
      this.socket.emit('typing', { channelId, username });
    }
  }

  emitTypingStop(channelId: string): void {
    if (this.socket) {
      this.socket.emit('typing-stop', { channelId });
    }
  }

  // ===== SERVER SETTINGS =====
  getServer(id: number): Observable<GgServer> {
    return this.http.get<GgServer>(`${this.apiUrl}/gg/servers/${id}`);
  }

  updateServer(id: number, data: { name?: string; avatar_url?: string; banner_url?: string }): Observable<GgServer> {
    return this.http.patch<GgServer>(`${this.apiUrl}/gg/servers/${id}`, data);
  }

  uploadServerAvatar(serverId: number, file: File): Observable<GgServer> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('serverId', String(serverId));
    return this.http.post<GgServer>(`${this.apiUrl}/gg/servers/upload-avatar`, fd);
  }

  uploadServerBanner(serverId: number, file: File): Observable<GgServer> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('serverId', String(serverId));
    return this.http.post<GgServer>(`${this.apiUrl}/gg/servers/upload-banner`, fd);
  }

  // ===== INVITE LINKS =====
  generateInvite(serverId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/invites`, {});
  }

  getServerInvites(serverId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/gg/servers/${serverId}/invites`);
  }

  revokeInvite(serverId: number, inviteId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/invites/${inviteId}/revoke`, {});
  }

  joinViaInvite(code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/invites/${code}`, {});
  }

  // ===== USER SEARCH =====
  searchUsers(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/gg/users/search`, { params: { q: query } });
  }

  // ===== FRIENDS =====
  getFriends(): Observable<FriendsData> {
    return this.http.get<FriendsData>(`${this.apiUrl}/gg/friends`);
  }

  getUserById(userId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/gg/users/${userId}`);
  }

  sendFriendRequest(username: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/friends/request`, { username });
  }

  acceptFriendRequest(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/friends/accept/${id}`, {});
  }

  removeFriend(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/friends/${id}`);
  }

  // ===== DM CONVERSATIONS =====
  getDmConversations(): Observable<DmConversation[]> {
    return this.http.get<DmConversation[]>(`${this.apiUrl}/gg/dm/conversations`);
  }

  createDmConversation(otherUserId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/dm/conversations`, { otherUserId });
  }

  getDmHistory(conversationId: number, limit = 50): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/gg/dm/history/${conversationId}`, {
      params: { limit: String(limit) },
    });
  }

  sendDmMessage(content: string, conversationId: number, attachmentUrl?: string): Observable<ChatMessage> {
    const body: any = { content, conversation_id: conversationId };
    if (attachmentUrl) body.attachment_url = attachmentUrl;
    return this.http.post<ChatMessage>(`${this.apiUrl}/gg/dm/send`, body);
  }

  deleteDmConversation(conversationId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/dm/conversations/${conversationId}`);
  }

  // ===== BLOCKING =====

  blockUser(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/users/block/${userId}`, {});
  }

  unblockUser(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/users/unblock/${userId}`, {});
  }

  getBlockedUsers(): Observable<FriendUser[]> {
    return this.http.get<FriendUser[]>(`${this.apiUrl}/gg/users/blocked`);
  }

  // ===== NOTIFICATIONS =====

  getNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${this.apiUrl}/gg/notifications`);
  }

  markNotificationRead(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<any> {
    return this.http.patch(`${this.apiUrl}/gg/notifications/read-all`, {});
  }

clearAllNotifications(): Observable<any> {
  return this.http.delete(`${this.apiUrl}/gg/notifications`);
}

deleteNotification(id: number): Observable<any> {
  return this.http.delete(`${this.apiUrl}/gg/notifications/${id}`);
}

  // ===== CARD COLLECTION =====

  getDailyDrawCards(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/draw/daily`);
  }

  claimDailyDraw(): Observable<DrawResult> {
    return this.http.post<DrawResult>(`${this.apiUrl}/cards/draw/daily/claim`, {});
  }

  drawWithTicket(ticketId: number): Observable<DrawResult> {
    return this.http.post<DrawResult>(`${this.apiUrl}/cards/draw/ticket/${ticketId}`, {});
  }

  getDrawTickets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/tickets`);
  }

  getCardCollection(page = 1, pageSize = 24, tier?: string, search?: string, sortBy?: string): Observable<{ items: any[]; total: number }> {
    let url = `${this.apiUrl}/cards/collection?page=${page}&page_size=${pageSize}`;
    if (tier) url += `&tier=${tier}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (sortBy) url += `&sort_by=${sortBy}`;
    return this.http.get<any[]>(url).pipe(
      map((rows) => this.unwrapPaginatedRows(rows)),
    );
  }

  getUserShowcase(userId: string, page = 1, pageSize = 50, sortBy?: string): Observable<{ items: any[]; total: number }> {
    let url = `${this.apiUrl}/cards/showcase/${userId}?page=${page}&page_size=${pageSize}`;
    if (sortBy) url += `&sort_by=${sortBy}`;
    return this.http.get<any[]>(url).pipe(
      map((rows) => this.unwrapPaginatedRows(rows)),
    );
  }

  private unwrapPaginatedRows(rows: any[]): { items: any[]; total: number } {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { items: [], total: 0 };
    }
    const first = rows[0];
    if (first && typeof first === 'object' && 'total_count' in first) {
      const total = Number(first.total_count) || 0;
      const items = first.empty_page ? [] : rows.map((r) => {
        if (r === first) {
          const { total_count, empty_page, ...rest } = r;
          return rest;
        }
        return r;
      });
      return { items, total };
    }
    return { items: rows, total: rows.length };
  }

  getCollectionStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/cards/collection/stats`);
  }

  toggleCardFavorite(gameCode: string): Observable<boolean> {
    return this.http.patch<boolean>(`${this.apiUrl}/cards/collection/${gameCode}/favorite`, {});
  }

  getUserShowcaseRaw(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/showcase/${userId}`).pipe(
      map((rows) => {
        // Strip pagination metadata before returning raw rows
        if (!Array.isArray(rows) || rows.length === 0) return rows;
        return rows.map((r) => {
          if (r && typeof r === 'object' && 'total_count' in r && Object.keys(r).length <= 2) {
            return {};
          }
          if (r && typeof r === 'object' && 'total_count' in r) {
            const { total_count, empty_page, ...rest } = r;
            return rest;
          }
          return r;
        }).filter(r => r && Object.keys(r).length > 0);
      }),
    );
  }

  createCardTrade(
    proposerCardIds: number[],
    receiverId: string,
    receiverCardIds: number[],
    allowUnfair = false,
    message?: string,
    parentTradeId?: number,
  ): Observable<any> {
    const body: any = { proposerCardIds, receiverId, receiverCardIds, allowUnfair };
    if (message) body.message = message;
    if (parentTradeId) body.parentTradeId = parentTradeId;
    return this.http.post<any>(`${this.apiUrl}/cards/trade`, body);
  }

  counterCardTrade(
    tradeId: number,
    counterProposerCardIds: number[],
    counterReceiverCardIds: number[],
    message?: string,
  ): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cards/trade/${tradeId}/counter`, {
      counterProposerCardIds,
      counterReceiverCardIds,
      message,
    });
  }

  checkTradeFairness(
    proposerCardIds: number[],
    receiverCardIds: number[],
  ): Observable<any> {
    const params: any = {
      proposerCardIds: proposerCardIds.join(','),
      receiverCardIds: receiverCardIds.join(','),
    };
    return this.http.get<any>(`${this.apiUrl}/cards/trade/fairness`, { params });
  }

  giftCard(gifterCardId: number, receiverId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cards/gift`, { gifterCardId, receiverId });
  }

  getCardTrades(otherUserId?: string): Observable<any[]> {
    const params: any = {};
    if (otherUserId) params.otherUserId = otherUserId;
    return this.http.get<any[]>(`${this.apiUrl}/cards/trades`, { params });
  }

  acceptCardTrade(tradeId: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/cards/trade/${tradeId}/accept`, {});
  }

  rejectCardTrade(tradeId: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/cards/trade/${tradeId}/reject`, {});
  }

  cancelCardTrade(tradeId: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/cards/trade/${tradeId}`);
  }

  getCardTaskProgress(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/tasks/progress`);
  }

  trackCardTask(taskType: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cards/tasks/track/${taskType}`, {});
  }

  addMessageReaction(messageId: number, messageSource: string, emoji: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cards/reactions`, { messageId, messageSource, emoji });
  }

  removeMessageReaction(messageId: number, messageSource: string, emoji: string): Observable<any> {
    return this.http.request<any>('DELETE', `${this.apiUrl}/cards/reactions`, {
      body: { messageId, messageSource, emoji },
    });
  }

  getMessageReactions(messageIds: number[], messageSource: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/reactions/${messageSource}?ids=${messageIds.join(',')}`);
  }

  getCardLeaderboard(limit = 50): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/leaderboard?limit=${limit}`);
  }
}
