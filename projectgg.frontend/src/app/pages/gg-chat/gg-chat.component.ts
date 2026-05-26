import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { Socket } from 'socket.io-client';
import {
  ChatService, ChatMessage, GgServer, GgChannel, GgServerMember,
  DmConversation, FriendUser, FriendsData, AppNotification,
} from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { VoiceService } from '../../services/voice.service';
import { ThemeService } from '../../services/theme.service';
import { CyberDropdownComponent, DropdownItem } from '../../components/cyber-dropdown/cyber-dropdown.component';

@Component({
  selector: 'app-gg-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, CyberDropdownComponent],
  templateUrl: './gg-chat.component.html',
  styleUrls: ['./gg-chat.component.scss'],
})
export class GgChatComponent implements OnInit, OnDestroy {
  private readonly apiUrl = environment.apiUrl;

  currentUser: any = null;
  currentStatus: string = 'online';
  loading = true;
  socket: Socket | null = null;

  // View mode
  viewMode: 'dm' | 'server' = 'dm';

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
  newChannelPrivate = false;

  // Channel settings
  showChannelSettings = false;
  channelSettingsChannel: GgChannel | null = null;
  channelSettingsRoles: string[] = [];
  availableRoles: string[] = ['admin', 'moderator', 'member'];

  // Messages (server channels)
  messages: ChatMessage[] = [];
  newMessage = '';
  sending = false;

  // Attachment / GIF
  uploadingFile = false;
  showGifPicker = false;
  gifSearchQuery = '';
  gifResults: any[] = [];
  gifSearching = false;
  pendingAttachmentUrl: string | null = null;

  replyToMessage: ChatMessage | null = null;
  showMentionAutocomplete = false;
  filteredMentions: any[] = [];
  mentionIndex = 0;

  get messageText(): string {
    return this.newMessage;
  }

  set messageText(value: string) {
    this.newMessage = value;
  }

  get pendingUpload(): string | null {
    return this.pendingAttachmentUrl;
  }

  get gifToSend(): string | null {
    return this.pendingAttachmentUrl;
  }

  get gifQuery(): string {
    return this.gifSearchQuery;
  }

  set gifQuery(value: string) {
    this.gifSearchQuery = value;
  }

  // Members
  members: GgServerMember[] = [];

  // Voice
  voiceConnected = false;
  voiceChannelId: string | null = null;
  voiceMuted = false;
  voiceDeafened = false;
  voiceConnecting = false;
  voiceMembers: { userId: string }[] = [];

  // DM
  dmConversations: DmConversation[] = [];
  friends: FriendUser[] = [];
  pendingRequests: FriendUser[] = [];
  sentRequests: FriendUser[] = [];
  selectedDm: DmConversation | null = null;
  dmMessages: ChatMessage[] = [];
  showFriendsList = false;
  showAddFriend = false;
  searchQuery = '';
  searchResults: any[] = [];
  searchingUsers = false;
  sendFriendUsername = '';
  sendingRequest = false;

  // Invite links
  showInviteLinks = false;
  inviteLoading = false;
  activeInvite: any = null;
  inviteLinkUrl = '';
  copied = false;

  // Join server
  showJoinServer = false;
  joinCode = '';
  joinLoading = false;
  joinError = '';

  // Server dropdown
  serverDropdownOpen = false;

  // Notifications
  notifications: AppNotification[] = [];
  unreadCount = 0;
  showNotifications = false;
  statusDropdownOpen = false;

  constructor(
    private readonly chatService: ChatService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly voiceService: VoiceService,
    readonly theme: ThemeService,
    private readonly el: ElementRef,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    try {
      const saved = localStorage.getItem('projectgg:status') as any;
      if (saved === 'online' || saved === 'away' || saved === 'offline' || saved === 'invisible') {
        this.currentStatus = saved;
      }
    } catch {}
    this.loadServers();
    this.loadDmData();
    this.loadNotifications();
    this.connectSocket();
  }

  // ===== DATA LOADING =====

  private loadDmData(): void {
    this.loadDmConversations();
    this.loadFriends();
  }

  private loadDmConversations(): void {
    this.chatService.getDmConversations().subscribe({
      next: (data) => {
        this.dmConversations = data;
        if (!this.selectedDm && data.length > 0) {
          this.selectDm(data[0]);
        }
        this.cdr.markForCheck();
      },
    });
  }

  private loadFriends(): void {
    this.chatService.getFriends().subscribe({
      next: (data: FriendsData) => {
        this.friends = data.accepted;
        this.pendingRequests = data.pending;
        this.sentRequests = data.sent;
        this.cdr.markForCheck();
      },
    });
  }

  // ===== SERVERS =====

  private loadServers(): void {
    this.serverLoading = true;
    this.chatService.getServers().subscribe({
      next: (data) => {
        this.servers = data;
        this.serverLoading = false;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.serverLoading = false;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToDms(): void {
    this.viewMode = 'dm';
    this.selectedServer = null;
    this.selectedChannel = null;
    this.messages = [];
    this.selectedDm = this.dmConversations[0] ?? null;
    if (this.selectedDm) {
      this.loadDmMessages(this.selectedDm.id);
    }
  }

  selectServer(server: GgServer): void {
    this.viewMode = 'server';
    this.selectedServer = server;
    this.selectedChannel = null;
    this.messages = [];
    this.selectedDm = null;
    this.dmMessages = [];
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
      error: (err) => {
        console.error(err);
        this.showCyberAlert(err.error?.message ?? 'Failed to create server');
      },
    });
  }

  confirmDelete(server: GgServer): void {
    this.showCyberConfirm(
      `Delete "${server.name}" and all its channels? This cannot be undone.`,
      () => this.deleteServer(server),
      'Delete',
      'Cancel'
    );
  }

  deleteServer(server: GgServer): void {
    this.chatService.deleteServer(server.id).subscribe({
      next: () => {
        this.servers = this.servers.filter(s => s.id !== server.id);
        if (this.selectedServer?.id === server.id) {
          if (this.servers.length > 0) {
            this.selectServer(this.servers[0]);
          } else {
            this.goToDms();
          }
        }
        this.showServerSettings = false;
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
    this.selectedChannel = channel;
    this.selectedDm = null;
    if (channel.type === 'voice') {
      this.toggleVoice(channel);
      return;
    }
    this.dmMessages = [];
    this.loadMessages(channel.id);
  }

  openCreateChannel(): void {
    this.showCreateChannel = true;
    this.newChannelName = '';
    this.newChannelType = 'text';
    this.newChannelPrivate = false;
  }

  createChannel(): void {
    const name = this.newChannelName.trim();
    if (!name || !this.selectedServer) return;
    const allowedRoles = this.newChannelPrivate ? ['admin', 'moderator', 'member'] : undefined;
    this.chatService.createChannel(this.selectedServer.id, name, this.newChannelType, allowedRoles).subscribe({
      next: (ch) => {
        this.channels = [...this.channels, ch];
        this.showCreateChannel = false;
        this.selectChannel(ch);
        this.cdr.markForCheck();
      },
      error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to create channel'),
    });
  }

  // ===== CHANNEL SETTINGS =====

  openChannelSettings(channel: GgChannel): void {
    this.channelSettingsChannel = channel;
    this.channelSettingsRoles = [...(channel.allowed_roles ?? [])];
    this.showChannelSettings = true;
  }

  toggleChannelRole(role: string): void {
    const idx = this.channelSettingsRoles.indexOf(role);
    if (idx >= 0) {
      this.channelSettingsRoles.splice(idx, 1);
    } else {
      this.channelSettingsRoles.push(role);
    }
  }

  saveChannelSettings(): void {
    if (!this.channelSettingsChannel) return;
    const ch = this.channelSettingsChannel;
    this.chatService.setChannelRoles(ch.id, this.channelSettingsRoles).subscribe({
      next: () => {
        ch.allowed_roles = [...this.channelSettingsRoles];
        this.showChannelSettings = false;
        this.cdr.markForCheck();
      },
      error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to update channel permissions'),
    });
  }

  isChannelPrivate(channel: GgChannel): boolean {
    return (channel.allowed_roles?.length ?? 0) > 0;
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

  // ===== MESSAGES (Server) =====

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
    if ((!content && !this.pendingAttachmentUrl) || this.sending || !this.selectedChannel) return;
    this.sending = true;
    this.chatService.sendGgMessage(content, String(this.selectedChannel.id), this.pendingAttachmentUrl ?? undefined, this.replyToMessage?.id).subscribe({
      next: (msg) => {
        this.messages = [...this.messages, msg];
        this.newMessage = '';
        this.pendingAttachmentUrl = null;
        this.replyToMessage = null;
        this.sending = false;
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  sendMessage(): void {
    this.send();
  }

  uploadFile(event: Event): void {
    this.handleFileInput(event);
  }

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
    return this.messages.find(m => m.id === msgId)?.content?.slice(0, 80) ?? '';
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
    const textarea = document.querySelector('.chat-textarea') as HTMLTextAreaElement | null;
    const cursorPos = textarea?.selectionStart ?? 0;
    const textBefore = this.messageText.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      this.filteredMentions = this.members.filter(m =>
        (m.username ?? '').toLowerCase().includes(query)
      ).slice(0, 8);
      this.showMentionAutocomplete = this.filteredMentions.length > 0;
      this.mentionIndex = 0;
    } else {
      this.showMentionAutocomplete = false;
    }
  }

  insertMention(member: any): void {
    const textarea = document.querySelector('.chat-textarea') as HTMLTextAreaElement | null;
    const cursorPos = textarea?.selectionStart ?? this.messageText.length;
    const textBefore = this.messageText.slice(0, cursorPos);
    const textAfter = this.messageText.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf('@');
    this.messageText = textBefore.slice(0, atIndex) + '@' + member.username + ' ' + textAfter;
    this.showMentionAutocomplete = false;
  }

  highlightMentions(content: string): string {
    if (!content) return '';
    return content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  openImage(url: string): void {
    window.open(url, '_blank');
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.gg-messages, .gg-dm-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  // ===== ATTACHMENTS / GIFS =====

  handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.uploadingFile = true;
    this.chatService.uploadFile(file).subscribe({
      next: (res) => {
        this.pendingAttachmentUrl = res.url;
        this.uploadingFile = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.uploadingFile = false;
        this.showCyberAlert(err.error?.message ?? 'Upload failed');
        this.cdr.markForCheck();
      },
    });
    input.value = '';
  }

  toggleGifPicker(): void {
    this.showGifPicker = !this.showGifPicker;
    if (this.showGifPicker) {
      this.searchGifs();
    }
  }

  searchGifs(query?: string): void {
    this.gifSearching = true;
    this.chatService.searchGifs(query ?? this.gifSearchQuery).subscribe({
      next: (results) => {
        this.gifResults = results;
        this.gifSearching = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.gifResults = [];
        this.gifSearching = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectGif(gif: any): void {
    const url = typeof gif === 'string' ? gif : gif.url;
    this.pendingAttachmentUrl = url;
    this.showGifPicker = false;
    this.cdr.markForCheck();
  }

  removeAttachment(): void {
    this.pendingAttachmentUrl = null;
  }

  isMediaUrl(url: string): boolean {
    return /\.(jpe?g|png|gif|webp|mp4)(\?.*)?$/i.test(url) || url.includes('giphy.com');
  }

  isVideoUrl(url: string): boolean {
    return /\.mp4(\?.*)?$/i.test(url);
  }

  downloadFile(url: string): void {
    window.open(url, '_blank');
  }

  isImageUrl(url: string): boolean {
    return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url) || url.includes('giphy.com');
  }

  // ===== MEMBERS =====

  private loadMembers(serverId: number): void {
    this.chatService.getServerMembers(serverId).subscribe({
      next: (data) => { this.members = data; this.cdr.markForCheck(); },
    });
  }

  canManageRoles(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser.id));
    return (me?.roles?.includes('owner') || me?.roles?.includes('admin')) ?? false;
  }

  canSendInChannel(channelId: number): boolean {
    const channel = this.channels.find(c => c.id === channelId);
    if (!channel || !channel.allowed_roles?.length) return true;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    return me?.roles?.some(role => channel.allowed_roles?.includes(role)) ?? false;
  }

  canKick(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser.id));
    return (me?.roles?.includes('owner') || me?.roles?.includes('admin') || me?.roles?.includes('moderator')) ?? false;
  }

  isSelf(member: GgServerMember): boolean {
    return String(member.user_id) === String(this.currentUser?.id);
  }

  changeRole(member: GgServerMember, newRole: string): void {
    if (!this.selectedServer) return;
    this.chatService.changeMemberRoles(this.selectedServer.id, member.user_id, [newRole]).subscribe({
      next: () => {
        member.roles = [newRole];
        this.cdr.markForCheck();
      },
      error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to change role'),
    });
  }

  confirmKick(member: GgServerMember): void {
    if (!this.selectedServer) return;
    const name = member.username ?? member.user_id;
    this.showCyberConfirm(
      `Kick ${name} from the server?`,
      () => {
        this.chatService.kickMember(this.selectedServer!.id, member.user_id).subscribe({
          next: () => {
            this.members = this.members.filter(m => m.user_id !== member.user_id);
            this.cdr.markForCheck();
          },
          error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to kick member'),
        });
      },
      'Kick',
      'Cancel'
    );
  }

  // ===== DROPDOWN =====

  toggleServerDropdown(): void {
    this.serverDropdownOpen = !this.serverDropdownOpen;
  }

  closeServerDropdown(): void {
    this.serverDropdownOpen = false;
  }

  get availableRolesForSettings(): string[] {
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    if (!me) return [];
    if (me.roles?.includes('owner')) return ['owner', 'admin', 'moderator', 'member'];
    if (me.roles?.includes('admin')) return ['admin', 'moderator', 'member'];
    return [];
  }

  isRoleHigher(member: GgServerMember): boolean {
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    if (!me) return false;
    const rank: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };
    return (rank[member.roles?.[0] ?? 'member'] ?? 0) < (rank[me.roles?.[0] ?? 'member'] ?? 0);
  }

  // ===== INVITE LINKS =====

  openInviteLinks(): void {
    if (!this.selectedServer) return;
    this.showInviteLinks = true;
    this.inviteLoading = true;
    this.activeInvite = null;
    this.inviteLinkUrl = '';
    this.copied = false;
    this.loadInvites();
  }

  closeInviteLinks(): void {
    this.showInviteLinks = false;
  }

  private loadInvites(): void {
    if (!this.selectedServer) return;
    this.chatService.getServerInvites(this.selectedServer.id).subscribe({
      next: (invites) => {
        const active = invites.find((i: any) => !i.revoked);
        this.activeInvite = active ?? null;
        if (active) {
          this.inviteLinkUrl = `${window.location.origin}/invite/${active.code}`;
        }
        this.inviteLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.inviteLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  generateInvite(): void {
    if (!this.selectedServer) return;
    this.inviteLoading = true;
    this.chatService.generateInvite(this.selectedServer.id).subscribe({
      next: (invite) => {
        this.activeInvite = invite;
        this.inviteLinkUrl = `${window.location.origin}/invite/${invite.code}`;
        this.copied = false;
        this.inviteLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showCyberAlert(err.error?.message ?? 'Failed to generate invite');
        this.inviteLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ===== CYBER CONFIRM / ALERT =====

  showConfirm = false;
  confirmMessage = '';
  confirmAction: (() => void) | null = null;
  confirmLabel = 'Confirm';
  confirmCancelLabel = 'Cancel';
  confirmShowCancel = true;

  showCyberConfirm(message: string, action: () => void, confirmLabel = 'Confirm', cancelLabel = 'Cancel'): void {
    this.confirmMessage = message;
    this.confirmAction = action;
    this.confirmLabel = confirmLabel;
    this.confirmCancelLabel = cancelLabel;
    this.confirmShowCancel = true;
    this.showConfirm = true;
  }

  showCyberAlert(message: string): void {
    this.confirmMessage = message;
    this.confirmAction = null;
    this.confirmLabel = 'OK';
    this.confirmShowCancel = false;
    this.showConfirm = true;
  }

  executeConfirm(): void {
    if (this.confirmAction) {
      this.confirmAction();
      this.confirmAction = null;
    }
    this.showConfirm = false;
  }

  cancelConfirm(): void {
    this.showConfirm = false;
    this.confirmAction = null;
  }

  copyInviteLink(): void {
    if (!this.inviteLinkUrl) return;
    navigator.clipboard.writeText(this.inviteLinkUrl).then(() => {
      this.copied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000);
    });
  }

  joinServerViaInvite(): void {
    const code = this.joinCode.trim();
    if (!code || this.joinLoading) return;
    this.joinLoading = true;
    this.joinError = '';
    this.chatService.joinViaInvite(code).subscribe({
      next: (res) => {
        this.joinLoading = false;
        this.showJoinServer = false;
        this.joinCode = '';
        this.loadServers();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.joinLoading = false;
        this.joinError = err.error?.message ?? 'Failed to join server';
        this.cdr.markForCheck();
      },
    });
  }

  // ===== SERVER SETTINGS =====

  showServerSettings = false;
  serverSettingsName = '';
  serverSettingsAvatarPreview: string | null = null;
  serverSettingsFile: File | null = null;

  openServerSettings(): void {
    if (!this.selectedServer) return;
    this.serverSettingsName = this.selectedServer.name;
    this.serverSettingsAvatarPreview = null;
    this.serverSettingsFile = null;
    this.showServerSettings = true;
  }

  handleServerAvatarInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.serverSettingsFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        this.serverSettingsAvatarPreview = reader.result as string;
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(this.serverSettingsFile);
    }
  }

  saveServerSettings(): void {
    if (!this.selectedServer) return;
    const name = this.serverSettingsName.trim();
    if (!name) return;

    const save = (avatarUrl?: string) => {
      const updateData: any = { name };
      if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
      this.chatService.updateServer(this.selectedServer!.id, updateData).subscribe({
        next: (updated) => {
          this.selectedServer = updated;
          const idx = this.servers.findIndex(s => s.id === updated.id);
          if (idx >= 0) this.servers[idx] = updated;
          this.showServerSettings = false;
          this.cdr.markForCheck();
        },
        error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to update server'),
      });
    };

    if (this.serverSettingsFile) {
      this.chatService.uploadServerAvatar(this.selectedServer.id, this.serverSettingsFile).subscribe({
        next: (updated) => save(updated.avatar_url ?? undefined),
        error: (err) => {
          console.error(err);
          save();
        },
      });
    } else {
      save();
    }
  }

  // ===== VOICE =====

  toggleVoice(channel: GgChannel): void {
    if (this.voiceConnected && this.voiceChannelId === String(channel.id)) {
      this.leaveVoice();
    } else {
      this.joinVoice(channel);
    }
  }

  private async joinVoice(channel: GgChannel): Promise<void> {
    this.voiceConnecting = true;
    this.voiceMembers = [];
    this.cdr.markForCheck();
    try {
      const currentUserId = this.auth.getCurrentUser()?.id;
      this.voiceMembers = currentUserId ? [{ userId: currentUserId }] : [];

      this.voiceService.onMemberJoined = (userId) => {
        if (!this.voiceMembers.find(m => m.userId === userId)) {
          this.voiceMembers = [...this.voiceMembers, { userId }];
          this.cdr.markForCheck();
        }
      };
      this.voiceService.onMemberLeft = (userId) => {
        this.voiceMembers = this.voiceMembers.filter(m => m.userId !== userId);
        this.cdr.markForCheck();
      };
      this.voiceService.onExistingMembers = (userIds) => {
        for (const uid of userIds) {
          if (!this.voiceMembers.find(m => m.userId === uid)) {
            this.voiceMembers = [...this.voiceMembers, { userId: uid }];
          }
        }
        this.cdr.markForCheck();
      };

      await this.voiceService.joinChannel('', String(channel.id));
      this.voiceConnected = true;
      this.voiceChannelId = String(channel.id);
      this.voiceMuted = false;
      this.voiceDeafened = false;
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
    this.voiceDeafened = false;
    this.voiceMembers = [];
    this.voiceService.onMemberJoined = null;
    this.voiceService.onMemberLeft = null;
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

  toggleVoiceDeaf(): void {
    this.voiceDeafened = !this.voiceDeafened;
    if (this.voiceDeafened) {
      this.voiceService.mute();
      this.voiceMuted = true;
    }
  }

  voiceMemberName(userId: string): string {
    const member = this.members.find(m => m.user_id === userId);
    return member?.username ?? userId.slice(0, 8);
  }

  voiceMemberAvatar(userId: string): string | null {
    const member = this.members.find(m => m.user_id === userId);
    return member?.avatar_url ?? null;
  }

  // ===== DMs =====

  selectDm(conv: DmConversation): void {
    this.viewMode = 'dm';
    this.selectedDm = conv;
    this.selectedChannel = null;
    this.selectedServer = null;
    this.messages = [];
    this.loadDmMessages(conv.id);
  }

  private loadDmMessages(conversationId: number): void {
    this.chatService.getDmHistory(conversationId, 50).subscribe({
      next: (msgs) => {
        this.dmMessages = msgs;
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
    });
  }

  sendDm(): void {
    const content = this.newMessage.trim();
    if ((!content && !this.pendingAttachmentUrl) || this.sending || !this.selectedDm) return;
    this.sending = true;
    this.chatService.sendDmMessage(content, this.selectedDm.id, this.pendingAttachmentUrl ?? undefined).subscribe({
      next: (msg) => {
        this.dmMessages = [...this.dmMessages, msg];
        this.newMessage = '';
        this.pendingAttachmentUrl = null;
        this.sending = false;
        this.cdr.markForCheck();
        this.scrollToBottom();
        this.selectedDm!.lastMessage = msg.content;
        this.selectedDm!.lastMessageAt = msg.created_at;
      },
      error: () => { this.sending = false; this.cdr.markForCheck(); },
    });
  }

  // ===== FRIENDS =====

  openAddFriend(): void {
    this.showAddFriend = true;
    this.searchQuery = '';
    this.searchResults = [];
    this.sendFriendUsername = '';
  }

  searchUsers(): void {
    const q = this.searchQuery.trim();
    if (!q || q.length < 1) { this.searchResults = []; return; }
    this.searchingUsers = true;
    this.chatService.searchUsers(q).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.searchingUsers = false;
        this.cdr.markForCheck();
      },
      error: () => { this.searchingUsers = false; },
    });
  }

  sendFriendRequest(): void {
    const username = this.sendFriendUsername.trim();
    if (!username) return;
    this.sendingRequest = true;
    this.chatService.sendFriendRequest(username).subscribe({
      next: () => {
        this.sendFriendUsername = '';
        this.sendingRequest = false;
        this.loadFriends();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.sendingRequest = false;
        this.showCyberAlert(err.error?.message ?? 'Failed to send friend request');
      },
    });
  }

  acceptRequest(id: number): void {
    this.chatService.acceptFriendRequest(id).subscribe({
      next: () => {
        this.loadFriends();
        this.cdr.markForCheck();
      },
    });
  }

  removeFriend(id: number): void {
    this.chatService.removeFriend(id).subscribe({
      next: () => {
        this.loadFriends();
        this.cdr.markForCheck();
      },
    });
  }

  startDmWithUser(otherUserId: string): void {
    this.chatService.createDmConversation(otherUserId).subscribe({
      next: (conv) => {
        this.showFriendsList = false;
        this.showAddFriend = false;
        this.chatService.getDmConversations().subscribe((convs) => {
          this.dmConversations = convs;
          const found = convs.find(c => c.id === conv.id);
          if (found) {
            this.selectDm(found);
          }
          this.cdr.markForCheck();
        });
      },
    });
  }

  // ===== SOCKET =====

  private connectSocket(): void {
    this.socket = this.chatService.connect();

    this.socket.on('message', (msg: ChatMessage) => {
      if (this.viewMode === 'server' && this.selectedChannel && msg.channel_id === String(this.selectedChannel.id)) {
        this.messages = [...this.messages, msg];
        this.cdr.markForCheck();
        this.scrollToBottom();
      }
    });

    this.socket.on('dm-message', (msg: ChatMessage) => {
      const convId = msg.channel_id?.startsWith('dm_') ? Number(msg.channel_id.replace('dm_', '')) : null;
      if (this.viewMode === 'dm' && this.selectedDm && convId === this.selectedDm.id) {
        this.dmMessages = [...this.dmMessages, msg];
        this.cdr.markForCheck();
        this.scrollToBottom();
      }
      const conv = this.dmConversations.find(c => c.id === convId);
      if (conv) {
        conv.lastMessage = msg.content;
        conv.lastMessageAt = msg.created_at;
      }
    });

    this.socket.on('friend-request', () => {
      this.loadFriends();
    });

    this.socket.on('friend-accepted', () => {
      this.loadFriends();
      this.loadDmConversations();
    });

    this.socket.on('notification', () => {
      this.loadNotifications();
    });
  }

  // ===== NOTIFICATIONS =====

  loadNotifications(): void {
    this.chatService.getNotifications().subscribe({
      next: (data) => {
        this.notifications = data;
        this.unreadCount = data.filter(n => !n.read).length;
        this.cdr.markForCheck();
      },
    });
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.showFriendsList = false;
      this.showAddFriend = false;
    }
  }

  markNotifRead(n: AppNotification): void {
    if (n.read) return;
    this.chatService.markNotificationRead(n.id).subscribe(() => {
      n.read = true;
      this.unreadCount = this.notifications.filter(x => !x.read).length;
      this.cdr.markForCheck();
    });
  }

  markAllNotifRead(): void {
    this.chatService.markAllNotificationsRead().subscribe(() => {
      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
      this.cdr.markForCheck();
    });
  }

  // ===== ESC HANDLER =====

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (this.serverDropdownOpen) {
      const target = event.target as HTMLElement;
      if (!this.el.nativeElement.contains(target) || !target.closest('.gg-server-dropdown-container')) {
        this.closeServerDropdown();
        this.cdr.markForCheck();
      }
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.showGifPicker) { this.showGifPicker = false; this.cdr.markForCheck(); }
    if (this.showConfirm) { this.cancelConfirm(); this.cdr.markForCheck(); }
    if (this.serverDropdownOpen) { this.closeServerDropdown(); this.cdr.markForCheck(); }
    if (this.showServerSettings) { this.showServerSettings = false; this.cdr.markForCheck(); }
    if (this.showCreateServer) { this.showCreateServer = false; this.cdr.markForCheck(); }
    if (this.showCreateChannel) { this.showCreateChannel = false; this.cdr.markForCheck(); }
    if (this.showFriendsList) { this.showFriendsList = false; this.cdr.markForCheck(); }
    if (this.showAddFriend) { this.showAddFriend = false; this.cdr.markForCheck(); }
    if (this.showInviteLinks) { this.closeInviteLinks(); this.cdr.markForCheck(); }
    if (this.showJoinServer) { this.showJoinServer = false; this.cdr.markForCheck(); }
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

  userAvatar(): string {
    return this.currentUser?.avatar ?? this.currentUser?.avatar_url ?? '';
  }

  userInitial(): string {
    return (this.currentUser?.username ?? '?')[0]?.toUpperCase() ?? '?';
  }

  setStatus(status: string): void {
    this.currentStatus = status;
    try { localStorage.setItem('projectgg:status', status); } catch {}
  }

  statusColor(): string {
    const colors: Record<string, string> = {
      online: '#00ff88', away: '#ffd700', offline: '#ff5f6d', invisible: '#888',
    };
    return colors[this.currentStatus] || '#888';
  }

  readonly statusOptions = [
    { id: 'online', label: 'Online', icon: '●' },
    { id: 'away', label: 'Away', icon: '●' },
    { id: 'offline', label: 'Offline', icon: '●' },
    { id: 'invisible', label: 'Invisible', icon: '●' },
  ];

  cycleStatus(): void {
    const idx = this.statusOptions.findIndex(s => s.id === this.currentStatus);
    const next = this.statusOptions[(idx + 1) % this.statusOptions.length];
    this.setStatus(next.id);
  }

  placeholderText(): string {
    if (this.selectedDm) return `Message @${this.selectedDm.otherUsername}`;
    if (this.selectedChannel) return `Message #${this.selectedChannel.name}`;
    return 'Message';
  }

  trackById(_: number, item: any): number {
    return item.id;
  }

  ngOnDestroy(): void {
    this.chatService.disconnect();
    if (this.voiceConnected) this.leaveVoice();
  }
}
