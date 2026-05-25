import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  id: number;
  user_id: number | null;
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

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly apiUrl = environment.apiUrl;
  private socket: Socket | null = null;

  constructor(private readonly http: HttpClient) {}

  connect(): Socket {
    if (!this.socket) {
      const wsUrl = environment.apiUrl.replace('http://', 'http://').replace(':3000/api', ':3000');
      this.socket = io(`${wsUrl}/chat`, { transports: ['websocket'] });
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

  createChannel(serverId: number, name: string, type: 'text' | 'voice'): Observable<GgChannel> {
    return this.http.post<GgChannel>(`${this.apiUrl}/gg/servers/${serverId}/channels`, { name, type });
  }

  deleteChannel(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/gg/channels/${id}`);
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

  sendGgMessage(content: string, channelId: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/gg/send`, { content, channel_id: channelId });
  }
}
