import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Socket } from 'socket.io-client';
import {
  ChatService, ChatMessage, GgServer, GgChannel, GgServerMember,
} from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { HeaderNavComponent } from '../../components/header-nav/header-nav.component';
import { VoiceService } from '../../services/voice.service';

@Component({
  selector: 'app-gg-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, HeaderNavComponent],
  templateUrl: './gg-chat.component.html',
  styleUrls: ['./gg-chat.component.scss'],
})
export class GgChatComponent implements OnInit, OnDestroy {
  private readonly apiUrl = environment.apiUrl;

  currentUser: any = null;
  loading = true;
  socket: Socket | null = null;

  // Servers
  servers: GgServer[] = [];
  selectedServer: GgServer | null = null;
  serverLoading = false;
  showCreateServer = false;
  newServerName = '';

  // Channels
  channels: GgChannel[] = [];
  selectedChannel: GgChannel | null = null;
  channelLoading = false;
  showCreateChannel = false;
  newChannelName = '';
  newChannelType: 'text' | 'voice' = 'text';

  // Messages
  messages: ChatMessage[] = [];
  newMessage = '';
  sending = false;

  // Members
  members: GgServerMember[] = [];

  // Voice
  voiceConnected = false;
  voiceChannelId: string | null = null;
  voiceMuted = false;
  voiceConnecting = false;

  constructor(
    private readonly chatService: ChatService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly voiceService: VoiceService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadServers();
    this.connectSocket();
  }

  // ===== SERVERS =====

  private loadServers(): void {
    this.serverLoading = true;
    this.chatService.getServers().subscribe({
      next: (data) => {
        this.servers = data;
        this.serverLoading = false;
        if (data.length > 0 && !this.selectedServer) {
          this.selectServer(data[0]);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.serverLoading = false;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectServer(server: GgServer): void {
    this.selectedServer = server;
    this.selectedChannel = null;
    this.messages = [];
    this.loadChannels(server.id);
    this.loadMembers(server.id);
  }

  openCreateServer(): void {
    this.showCreateServer = true;
    this.newServerName = '';
  }

  createServer(): void {
    const name = this.newServerName.trim();
    if (!name) return;
    this.chatService.createServer(name).subscribe({
      next: (server) => {
        this.servers = [...this.servers, server];
        this.showCreateServer = false;
        this.selectServer(server);
        this.cdr.markForCheck();
      },
      error: (err) => console.error(err),
    });
  }

  deleteServer(server: GgServer): void {
    if (!confirm(`Delete "${server.name}" and all its channels?`)) return;
    this.chatService.deleteServer(server.id).subscribe({
      next: () => {
        this.servers = this.servers.filter(s => s.id !== server.id);
        if (this.selectedServer?.id === server.id) {
          this.selectedServer = this.servers[0] ?? null;
          this.selectedChannel = null;
          this.messages = [];
          if (this.selectedServer) {
            this.loadChannels(this.selectedServer.id);
            this.loadMembers(this.selectedServer.id);
          }
        }
        this.cdr.markForCheck();
      },
    });
  }

  // ===== CHANNELS =====

  private loadChannels(serverId: number): void {
    this.channelLoading = true;
    this.chatService.getChannels(serverId).subscribe({
      next: (data) => {
        this.channels = data;
        this.channelLoading = false;
        const first = data.find(c => c.type === 'text');
        if (first) this.selectChannel(first);
        this.cdr.markForCheck();
      },
      error: () => {
        this.channelLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectChannel(channel: GgChannel): void {
    if (channel.type === 'voice') {
      this.toggleVoice(channel);
      return;
    }
    this.selectedChannel = channel;
    this.loadMessages(channel.id);
  }

  openCreateChannel(): void {
    this.showCreateChannel = true;
    this.newChannelName = '';
    this.newChannelType = 'text';
  }

  createChannel(): void {
    const name = this.newChannelName.trim();
    if (!name || !this.selectedServer) return;
    this.chatService.createChannel(this.selectedServer.id, name, this.newChannelType).subscribe({
      next: (ch) => {
        this.channels = [...this.channels, ch];
        this.showCreateChannel = false;
        this.selectChannel(ch);
        this.cdr.markForCheck();
      },
      error: (err) => console.error(err),
    });
  }

  deleteChannel(channel: GgChannel): void {
    if (!confirm(`Delete #${channel.name}?`)) return;
    this.chatService.deleteChannel(channel.id).subscribe({
      next: () => {
        this.channels = this.channels.filter(c => c.id !== channel.id);
        if (this.selectedChannel?.id === channel.id) {
          this.selectedChannel = this.channels.find(c => c.type === 'text') ?? null;
          this.messages = [];
          if (this.selectedChannel) this.loadMessages(this.selectedChannel.id);
        }
        this.cdr.markForCheck();
      },
    });
  }

  channelIcon(type: string): string {
    return type === 'voice' ? 'volume_up' : 'tag';
  }

  // ===== MESSAGES =====

  private loadMessages(channelId: number): void {
    this.http.get<ChatMessage[]>(`${this.apiUrl}/gg/history?channel=${channelId}&limit=50`).subscribe({
      next: (msgs) => {
        this.messages = msgs;
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
    });
  }

  send(): void {
    const content = this.newMessage.trim();
    if (!content || this.sending || !this.selectedChannel) return;
    this.sending = true;
    this.chatService.sendGgMessage(content, String(this.selectedChannel.id)).subscribe({
      next: (msg) => {
        this.messages = [...this.messages, msg];
        this.newMessage = '';
        this.sending = false;
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.gg-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  // ===== MEMBERS =====

  private loadMembers(serverId: number): void {
    this.chatService.getServerMembers(serverId).subscribe({
      next: (data) => { this.members = data; this.cdr.markForCheck(); },
    });
  }

  // ===== VOICE =====

  private toggleVoice(channel: GgChannel): void {
    if (this.voiceConnected && this.voiceChannelId === String(channel.id)) {
      this.leaveVoice();
    } else {
      this.joinVoice(channel);
    }
  }

  private async joinVoice(channel: GgChannel): Promise<void> {
    this.voiceConnecting = true;
    this.cdr.markForCheck();
    try {
      await this.voiceService.joinChannel('', String(channel.id));
      this.voiceConnected = true;
      this.voiceChannelId = String(channel.id);
      this.voiceMuted = false;
    } catch (e) {
      console.error('Voice join failed:', e);
    }
    this.voiceConnecting = false;
    this.cdr.markForCheck();
  }

  leaveVoice(): void {
    this.voiceService.leaveChannel();
    this.voiceConnected = false;
    this.voiceChannelId = null;
    this.voiceMuted = false;
  }

  toggleVoiceMute(): void {
    if (this.voiceMuted) {
      this.voiceService.unmute();
      this.voiceMuted = false;
    } else {
      this.voiceService.mute();
      this.voiceMuted = true;
    }
  }

  // ===== SOCKET =====

  private connectSocket(): void {
    this.socket = this.chatService.connect();
    this.socket.on('message', (msg: ChatMessage) => {
      if (this.selectedChannel && msg.channel_id === String(this.selectedChannel.id)) {
        this.messages = [...this.messages, msg];
        this.cdr.markForCheck();
        this.scrollToBottom();
      }
    });
  }

  // ===== UTILITY =====

  avatarForUsername(username: string): string {
    if (!username) return '';
    const member = this.members.find(
      m => m.username === username || m.user_id === username,
    );
    return member?.avatar_url ?? '';
  }

  serverAvatar(server: GgServer): string {
    return server.avatar_url ?? '';
  }

  serverInitial(server: GgServer): string {
    return server.name[0]?.toUpperCase() ?? '?';
  }

  trackById(_: number, item: any): number {
    return item.id;
  }

  handleThemeChange(_: any): void {}
  handleThemeToggle(): void {}
  handleStatusChange(_: any): void {}
  handleStatusToggle(): void {}
  handleProfileToggle(): void {}

  ngOnDestroy(): void {
    this.chatService.disconnect();
    if (this.voiceConnected) this.leaveVoice();
  }
}
