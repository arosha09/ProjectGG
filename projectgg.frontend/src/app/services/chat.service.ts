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
  created_at: string;
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

  getHistory(limit = 50): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/chat/history?limit=${limit}`);
  }

  sendMessage(content: string, channelId?: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/chat/send`, { content, channel_id: channelId });
  }
}
