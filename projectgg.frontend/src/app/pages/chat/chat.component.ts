import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { Socket } from 'socket.io-client';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { VoiceService } from '../../services/voice.service';
import { ThemeService } from '../../services/theme.service';
import { CyberContextMenuComponent, ContextMenuItem } from '../../components/cyber-context-menu/cyber-context-menu.component';
import { ThemeOption } from '../../components/theme-selector/theme-selector.component';
import { StatusOption } from '../../components/status-selector/status-selector.component';
import { CommonModule } from '@angular/common';

interface GuildChannel {
  id: string; name: string; type: number;
  position: number; categoryId: string | null; categoryName: string | null;
}

interface VoiceMember {
  userId: string; username: string;
  channelId: string; channelName: string;
}

interface ChannelGroup {
  name: string | null;
  channels: GuildChannel[];
}

interface UserRole {
  id: string; name: string; color: number; hoist: boolean; position: number;
}

interface ChannelPermission {
  channelId: string; channelName: string;
  canView: boolean; canSend: boolean;
  canConnect: boolean; canSpeak: boolean;
}

interface UserPermissions {
  roles: UserRole[];
  permissions: ChannelPermission[];
  joinedAt: string | null;
  nickname: string | null;
  avatar: string | null;
}

interface GuildMember {
  id: string; username: string; globalName: string | null;
  avatar: string | null; roles: { id: string; name: string; color: number }[];
  status: string; isBot: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatCardModule, MatButtonModule, CyberContextMenuComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly apiUrl = environment.apiUrl;

  currentUser: any = null;
  loading = true;

  // Theme
  readonly theme: ThemeService;

  // Discord linking gate
  discordLinked = false;
  discordUsername: string | null = null;
  checkingDiscord = true;

  // Guild state
  channels: GuildChannel[] = [];
  selectedChannel: GuildChannel | null = null;
  voiceMembers: VoiceMember[] = [];
  messages: ChatMessage[] = [];
  socket: Socket | null = null;
  members: GuildMember[] = [];
  userPermissions: UserPermissions | null = null;
  permissionsLoading = false;
  membersLoading = false;

  // Writing
  messageText = '';
  replyToMessage: ChatMessage | null = null;
  pendingUpload: File | null = null;
  gifToSend: string | null = null;
  sending = false;
  uploading = false;

  // GIF picker
  showGifPicker = false;
  gifQuery = '';
  gifResults: any[] = [];
  gifSearchTimeout?: number;

  // Mention autocomplete
  showMentionAutocomplete = false;
  mentionIndex = 0;
  filteredMentions: GuildMember[] = [];

  // Image preview
  previewImageUrl: string | null = null;

  // Voice
  voiceConnected = false;
  voiceChannelId: string | null = null;
  voiceMuted = false;
  voiceConnecting = false;

  // Context menu
  @ViewChild('ctxMenu') ctxMenu: CyberContextMenuComponent | null = null;

  constructor(
    private readonly chatService: ChatService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly voiceService: VoiceService,
    theme: ThemeService,
  ) {
    this.theme = theme;
    this.updateViewportHeight();
  }

  // Measures the true visible viewport height, accounting for mobile browser
  // chrome (address bar, soft keyboard) via visualViewport when available.
  @HostListener('window:resize')
  updateViewportHeight(): void {
    const h = (window.visualViewport?.height ?? window.innerHeight);
    document.documentElement.style.setProperty('--vh', `${h}px`);
  }

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.checkDiscord();

    // visualViewport fires on mobile when the soft keyboard appears/hides
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onVisualViewport);
      window.visualViewport.addEventListener('scroll', this._onVisualViewport);
    }
  }

  private readonly _onVisualViewport = (): void => this.updateViewportHeight();

  private checkDiscord(): void {
    this.checkingDiscord = true;
    this.http.get<any>(`${this.apiUrl}/chat/check-discord`).subscribe({
      next: (res) => {
        this.discordLinked = res.linked;
        this.discordUsername = res.discordUsername;
        this.checkingDiscord = false;
        if (this.discordLinked) {
          this.loadGuild();
          this.loadPermissions();
          this.loadMembers();
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

  private loadPermissions(): void {
    this.permissionsLoading = true;
    this.http.get<any>(`${this.apiUrl}/chat/permissions`).subscribe({
      next: (res) => {
        if (res.permissions) {
          this.userPermissions = res.permissions;
        }
        this.permissionsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.permissionsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadMembers(): void {
    this.membersLoading = true;
    this.http.get<GuildMember[]>(`${this.apiUrl}/chat/members`).subscribe({
      next: (data) => {
        this.members = data ?? [];
        this.membersLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.membersLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  canViewChannel(channelId: string): boolean {
    if (!this.userPermissions) return true;
    const perm = this.userPermissions.permissions.find(p => p.channelId === channelId);
    return perm ? perm.canView : true;
  }

  canSendInChannel(channelId: string): boolean {
    if (!this.userPermissions) return true;
    const perm = this.userPermissions.permissions.find(p => p.channelId === channelId);
    return perm ? perm.canSend : true;
  }

  canConnectToChannel(channelId: string): boolean {
    if (!this.userPermissions) return true;
    const perm = this.userPermissions.permissions.find(p => p.channelId === channelId);
    return perm ? perm.canConnect : true;
  }

  get mainRole(): UserRole | null {
    if (!this.userPermissions?.roles.length) return null;
    const sorted = [...this.userPermissions.roles].sort((a, b) => b.position - a.position);
    return sorted[0];
  }

  get roleColor(): string {
    const r = this.mainRole;
    return r?.color ? `#${r.color.toString(16).padStart(6, '0')}` : '';
  }

  get onlineMembers(): GuildMember[] {
    return this.members.filter(m => m.status === 'online');
  }

  get idleMembers(): GuildMember[] {
    return this.members.filter(m => m.status === 'idle');
  }

  get dndMembers(): GuildMember[] {
    return this.members.filter(m => m.status === 'dnd');
  }

  get offlineMembers(): GuildMember[] {
    return this.members.filter(m => m.status === 'offline');
  }

  memberAvatar(member: GuildMember): string {
    return member.avatar ?? '';
  }

  memberRoleColor(member: GuildMember): string {
    const sorted = [...member.roles].sort((a, b) => b.color - a.color);
    const top = sorted.find(r => r.color !== 0);
    return top ? `#${top.color.toString(16).padStart(6, '0')}` : '';
  }

  avatarForUsername(username: string): string {
    const member = this.members.find(
      m => m.username === username || m.globalName === username
    );
    return member?.avatar ?? '';
  }

  private loadGuild(): void {
    this.loading = true;
    this.http.get<any>(`${this.apiUrl}/chat/guild`).subscribe({
      next: (data) => {
        this.channels = data.channels ?? [];
        this.voiceMembers = data.voiceMembers ?? [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get channelGroups(): ChannelGroup[] {
    const groups = new Map<string | null, GuildChannel[]>();
    for (const ch of this.channels) {
      if (ch.type === 4 || ch.type === 2 || ch.type === 13) continue;
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

  // ===== RICH CHAT METHODS =====

  startReply(msg: ChatMessage): void {
    this.replyToMessage = msg;
  }

  cancelReply(): void {
    this.replyToMessage = null;
  }

  getReplyAuthor(msgId: number | null | undefined): string {
    const msg = this.messages.find(m => m.id === msgId);
    return msg?.username ?? 'Unknown';
  }

  getReplyPreview(msgId: number | null | undefined): string {
    const msg = this.messages.find(m => m.id === msgId);
    return msg ? (msg.content?.slice(0, 80) ?? '') : '';
  }

  uploadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingUpload = input.files[0];
    }
  }

  async sendMessage(): Promise<void> {
    if (!this.messageText.trim() && !this.pendingUpload && !this.gifToSend) return;
    const channelId = this.selectedChannel?.id;
    if (!channelId) return;

    this.sending = true;
    let attachmentUrl = '';

    if (this.gifToSend) {
      attachmentUrl = this.gifToSend;
      this.gifToSend = null;
    } else if (this.pendingUpload) {
      this.uploading = true;
      const formData = new FormData();
      formData.append('file', this.pendingUpload);
      try {
        const res = await this.http.post<{ url: string }>(`${this.apiUrl}/chat/upload`, formData).toPromise();
        attachmentUrl = res?.url ?? '';
      } catch (e) {
        console.error('Upload failed:', e);
      }
      this.uploading = false;
      this.pendingUpload = null;
    }

    const body: any = { content: this.messageText, channel_id: channelId };
    if (this.replyToMessage) body.reply_to = this.replyToMessage.id;
    if (attachmentUrl) body.attachment_url = attachmentUrl;

    this.http.post(`${this.apiUrl}/chat/send`, body).subscribe({
      next: () => {
        this.messageText = '';
        this.replyToMessage = null;
        this.sending = false;
        this.cdr.markForCheck();
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
    if (event.key === 'Escape') {
      this.cancelReply();
      this.showGifPicker = false;
      this.showMentionAutocomplete = false;
    }
    if (event.key === 'ArrowDown' && this.showMentionAutocomplete) {
      event.preventDefault();
      this.mentionIndex = Math.min(this.mentionIndex + 1, this.filteredMentions.length - 1);
    }
    if (event.key === 'ArrowUp' && this.showMentionAutocomplete) {
      event.preventDefault();
      this.mentionIndex = Math.max(this.mentionIndex - 1, 0);
    }
    if (event.key === 'Enter' && this.showMentionAutocomplete) {
      event.preventDefault();
      if (this.filteredMentions[this.mentionIndex]) {
        this.insertMention(this.filteredMentions[this.mentionIndex]);
      }
    }
    if (event.key === 'Tab' && this.showMentionAutocomplete) {
      event.preventDefault();
      if (this.filteredMentions[this.mentionIndex]) {
        this.insertMention(this.filteredMentions[this.mentionIndex]);
      }
    }
  }

  onInputChange(): void {
    const cursorPos = (document.querySelector('.chat-textarea') as HTMLTextAreaElement)?.selectionStart ?? 0;
    const textBefore = this.messageText.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      this.filteredMentions = this.members.filter(m =>
        m.username.toLowerCase().includes(query)
      ).slice(0, 8);
      this.showMentionAutocomplete = this.filteredMentions.length > 0;
      this.mentionIndex = 0;
    } else {
      this.showMentionAutocomplete = false;
    }
  }

  insertMention(member: GuildMember): void {
    const cursorPos = (document.querySelector('.chat-textarea') as HTMLTextAreaElement)?.selectionStart ?? 0;
    const textBefore = this.messageText.slice(0, cursorPos);
    const textAfter = this.messageText.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf('@');
    const newText = textBefore.slice(0, atIndex) + '@' + member.username + ' ' + textAfter;
    this.messageText = newText;
    this.showMentionAutocomplete = false;
  }

  toggleGifPicker(): void {
    this.showGifPicker = !this.showGifPicker;
    if (this.showGifPicker) {
      this.searchGifs();
    }
  }

  searchGifs(): void {
    clearTimeout(this.gifSearchTimeout);
    this.gifSearchTimeout = setTimeout(() => {
      const q = this.gifQuery || 'trending';
      const endpoint = q === 'trending' ? '/chat/gifs/trending' : `/chat/gifs?q=${encodeURIComponent(q)}&limit=12`;
      this.http.get<any>(`${this.apiUrl}${endpoint}`).subscribe({
        next: (res) => { this.gifResults = res.results ?? []; this.cdr.markForCheck(); },
      });
    }, 400);
  }

  selectGif(url: string): void {
    this.showGifPicker = false;
    this.gifToSend = url;
    this.sendMessage();
  }

  highlightMentions(content: string): string {
    if (!content) return '';
    return content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  openImage(url: string): void {
    this.previewImageUrl = url;
  }

  closeImage(): void {
    this.previewImageUrl = null;
  }

  // ===== CONTEXT MENU =====

  onMsgContextMenu(e: MouseEvent, msg: ChatMessage): void {
    const items: ContextMenuItem[] = [
      {
        label: 'Reply', icon: 'reply',
        action: () => this.startReply(msg),
      },
      {
        label: 'Copy Message', icon: 'content_copy',
        action: () => navigator.clipboard.writeText(msg.content).catch(() => {}),
      },
      { label: '', icon: '', action: () => {}, divider: true },
      {
        label: 'Copy ID', icon: 'fingerprint',
        action: () => navigator.clipboard.writeText(String(msg.id)).catch(() => {}),
      },
    ];
    if (msg.source === 'discord') {
      items.push({
        label: 'Copy Discord ID', icon: 'tag',
        action: () => navigator.clipboard.writeText(msg.discord_message_id ?? String(msg.id)).catch(() => {}),
      });
    }
    this.ctxMenu?.open(e, items, 'Message Actions');
  }

  onChannelContextMenu(e: MouseEvent, ch: GuildChannel): void {
    const items: ContextMenuItem[] = [
      {
        label: 'Mark as Read', icon: 'done_all',
        action: () => this.selectChannel(ch),
      },
      { label: '', icon: '', action: () => {}, divider: true },
      {
        label: 'Copy Channel ID', icon: 'link',
        action: () => navigator.clipboard.writeText(ch.id).catch(() => {}),
      },
    ];
    this.ctxMenu?.open(e, items, `#${ch.name}`);
  }

  // ===== THEME HANDLING =====

  handleThemeChange(theme: ThemeOption): void {
    this.theme.setTheme(theme);
  }

  handleCustomColorChange(color: string): void {
    this.theme.setCustomColor(color);
  }

  handleThemeToggle(): void {}
  handleStatusChange(status: StatusOption): void {}
  handleStatusToggle(): void {}
  handleProfileToggle(): void {}

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.chat-messages-viewport');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  ngOnDestroy(): void {
    this.chatService.disconnect();
    if (this.voiceConnected) this.leaveVoice();
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._onVisualViewport);
      window.visualViewport.removeEventListener('scroll', this._onVisualViewport);
    }
  }
}