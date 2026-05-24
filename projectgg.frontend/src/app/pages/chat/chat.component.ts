import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router, RouterLink } from '@angular/router';
import { Socket } from 'socket.io-client';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { HeaderNavComponent } from '../../components/header-nav/header-nav.component';
import { VoiceService } from '../../services/voice.service';

interface GuildChannel {
  id: string; name: string; type: number;
  typeLabel: string; position: number;
  categoryId: string | null; categoryName: string | null;
}

interface VoiceMember {
  userId: string; username: string;
  channelId: string; channelName: string;
}

interface ChannelGroup {
  name: string | null;
  channels: GuildChannel[];
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatCardModule, HeaderNavComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly apiUrl = environment.apiUrl;

  currentUser: any = null;
  loading = true;

  // Discord linking gate
  discordLinked = false;
  discordUsername: string | null = null;
  checkingDiscord = true;

  // Server data
  channels: GuildChannel[] = [];
  voiceMembers: VoiceMember[] = [];
  selectedChannel: GuildChannel | null = null;
  messages: ChatMessage[] = [];
  newMessage = '';
  sending = false;
  socket: Socket | null = null;

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
    this.checkDiscord();
  }

  private checkDiscord(): void {
    this.checkingDiscord = true;
    this.http.get<any>(`${this.apiUrl}/chat/check-discord`).subscribe({
      next: (res) => {
        this.discordLinked = res.linked;
        this.discordUsername = res.discordUsername;
        this.checkingDiscord = false;
        if (this.discordLinked) {
          this.loadGuild();
          this.connectSocket();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.checkingDiscord = false;
        this.cdr.markForCheck();
      },
    });
  }

  linkDiscord(): void {
    this.router.navigate(['/settings'], { queryParams: { highlight: 'discord' } });
  }

  private loadGuild(): void {
    this.loading = true;
    this.http.get<any>(`${this.apiUrl}/chat/guild`).subscribe({
      next: (data) => {
        this.channels = data.channels ?? [];
        this.voiceMembers = data.voiceMembers ?? [];
        this.loading = false;
        const firstText = this.channels.find(c => c.type === 0);
        if (firstText) this.selectChannel(firstText);
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get channelGroups(): ChannelGroup[] {
    const groups = new Map<string | null, GuildChannel[]>();
    for (const ch of this.channels) {
      if (ch.type === 4) continue;
      const groupKey = ch.categoryId ?? '__no_category';
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(ch);
    }
    return Array.from(groups.entries())
      .map(([key, chs]) => ({
        name: key === '__no_category' ? null : (chs[0]?.categoryName ?? key),
        channels: chs.sort((a, b) => a.position - b.position),
      }));
  }

  get voiceChannels(): GuildChannel[] {
    return this.channels.filter(c => c.type === 2 || c.type === 13);
  }

  getMembersForVoiceChannel(channelId: string): VoiceMember[] {
    return this.voiceMembers.filter(m => m.channelId === channelId);
  }

  channelIcon(type: number): string {
    const icons: Record<number, string> = {
      0: 'tag', 2: 'volume_up', 5: 'campaign',
      13: 'mic', 15: 'forum', 16: 'photo_library',
    };
    return icons[type] ?? 'tag';
  }

  selectChannel(channel: GuildChannel): void {
    if (channel.type === 2 || channel.type === 13) {
      this.toggleVoice(channel);
      return;
    }
    this.selectedChannel = channel;
    this.loadMessages(channel.id);
  }

  private toggleVoice(channel: GuildChannel): void {
    if (this.voiceConnected && this.voiceChannelId === channel.id) {
      this.leaveVoice();
    } else {
      this.joinVoice(channel);
    }
  }

  private async joinVoice(channel: GuildChannel): Promise<void> {
    this.voiceConnecting = true;
    this.cdr.markForCheck();
    try {
      await this.voiceService.joinChannel('', channel.id);
      this.voiceConnected = true;
      this.voiceChannelId = channel.id;
      this.voiceMuted = false;
    } catch (e) {
      console.error('Failed to join voice:', e);
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

  private loadMessages(channelId: string): void {
    this.http.get<ChatMessage[]>(`${this.apiUrl}/chat/history?channel=${channelId}&limit=50`).subscribe({
      next: (msgs) => { this.messages = msgs; this.cdr.markForCheck(); this.scrollToBottom(); },
      error: () => {},
    });
  }

  private connectSocket(): void {
    this.socket = this.chatService.connect();
    this.socket.on('message', (msg: ChatMessage) => {
      if (!this.selectedChannel || msg.channel_id === this.selectedChannel.id) {
        this.messages = [...this.messages, msg];
        this.cdr.markForCheck();
        this.scrollToBottom();
      }
      if (msg.channel_type === 'voice') {
        this.http.get<any>(`${this.apiUrl}/chat/guild`).subscribe({
          next: (data) => { this.voiceMembers = data.voiceMembers ?? []; this.cdr.markForCheck(); },
        });
      }
    });
  }

  send(): void {
    const content = this.newMessage.trim();
    if (!content || this.sending || !this.selectedChannel) return;
    this.sending = true;
    this.chatService.sendMessage(content, this.selectedChannel.id).subscribe({
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
      const el = document.querySelector('.chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  handleThemeChange(theme: any): void {}
  handleThemeToggle(): void {}
  handleStatusChange(status: any): void {}
  handleStatusToggle(): void {}
  handleProfileToggle(): void {}

  ngOnDestroy(): void {
    this.chatService.disconnect();
    if (this.voiceConnected) this.leaveVoice();
  }
}
