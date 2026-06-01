import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
      const wsUrl = environment.apiUrl.replace('http://', 'http://').replace(':3000/api', ':3000');
      const user = this.auth.getCurrentUser();
      this.socket = io(`${wsUrl}/chat`, {
        transports: ['websocket'],
        query: { userId: user?.id ?? '' },
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

  createChannel(serverId: number, name: string, type: 'text' | 'voice', allowed_roles?: string[]): Observable<GgChannel> {
    return this.http.post<GgChannel>(`${this.apiUrl}/gg/servers/${serverId}/channels`, { name, type, allowed_roles });
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

  getServerRoles(serverId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/gg/servers/${serverId}/roles`);
  }

  createServerRole(serverId: number, name: string, color?: string, permissions?: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/gg/servers/${serverId}/roles`, { name, color, permissions });
  }

  deleteServerRole(serverId: number, roleName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/servers/${serverId}/roles/${roleName}`);
  }

  emitStatus(status: string): void {
    if (this.socket) {
      this.socket.emit('status-change', { status });
    }
  }

  // ===== SERVER SETTINGS =====
  updateServer(id: number, data: { name?: string; avatar_url?: string }): Observable<GgServer> {
    return this.http.patch<GgServer>(`${this.apiUrl}/gg/servers/${id}`, data);
  }

  uploadServerAvatar(serverId: number, file: File): Observable<GgServer> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('serverId', String(serverId));
    return this.http.post<GgServer>(`${this.apiUrl}/gg/servers/upload-avatar`, fd);
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

  getCardCollection(page = 1, pageSize = 24, tier?: string, search?: string): Observable<any[]> {
    let url = `${this.apiUrl}/cards/collection?page=${page}&page_size=${pageSize}`;
    if (tier) url += `&tier=${tier}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return this.http.get<any[]>(url);
  }

  getCollectionStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/cards/collection/stats`);
  }

  toggleCardFavorite(gameCode: string): Observable<boolean> {
    return this.http.patch<boolean>(`${this.apiUrl}/cards/collection/${gameCode}/favorite`, {});
  }

  getUserShowcase(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/cards/showcase/${userId}`);
  }

  createCardTrade(proposerCardId: number, receiverId: string, receiverCardId: number, allowUnfair = false): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cards/trade`, { proposerCardId, receiverId, receiverCardId, allowUnfair });
  }

  checkTradeFairness(proposerCardId: number, receiverCardId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/cards/trade/fairness`, { params: { proposerCardId, receiverCardId } });
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
