import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ElementRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
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
import { GgChatFriendsComponent } from '../gg-chat-friends/gg-chat-friends.component';
import { UserStatusService, UserStatus } from '../../services/user-status.service';
import { UsersService } from '../../services/users.service';
import { XpService } from '../../services/xp.service';
import { MemberListComponent } from './member-list/member-list.component';
import { ServerListComponent } from './server-list/server-list.component';
import { ChannelListComponent } from './channel-list/channel-list.component';
import { CyberConfirmComponent } from '../../components/cyber-confirm/cyber-confirm.component';
import { CardTradingComponent } from '../../components/card-trading/card-trading.component';
import { CyberEmojiPickerComponent } from '../../components/cyber-emoji-picker/cyber-emoji-picker.component';

@Component({
  selector: 'app-gg-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, RouterModule, CyberDropdownComponent, CyberConfirmComponent, GgChatFriendsComponent, MemberListComponent, ServerListComponent, ChannelListComponent, CardTradingComponent, CyberEmojiPickerComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './gg-chat.component.html',
  styleUrls: ['./gg-chat.component.scss'],
})
export class GgChatComponent implements OnInit, OnDestroy {
  private readonly apiUrl = environment.apiUrl;

  currentUser: any = null;
  currentStatus: UserStatus = 'online';
  loading = true;
  socket: Socket | null = null;

  // View mode
  viewMode: 'dm' | 'server' | 'create-server' | 'profile' | 'friends' = 'dm';

  // Servers
  servers: GgServer[] = [];
  selectedServer: GgServer | null = null;
  serverLoading = false;
  showCreateServer = false;
  newServerName = '';
  newServerAvatarPreview: string | null = null;
  newServerAvatarFile: File | null = null;
  createServerView: 'pick' | 'create' | 'join' = 'pick';
  creatingServer = false;

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
  messagesLoading = false;
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
  membersLoading = false;

  // Voice
  voiceConnected = false;
  voiceChannelId: string | null = null;
  voiceMuted = false;
  voiceDeafened = false;
  voiceConnecting = false;
  voiceMembers: { userId: string; muted: boolean; deafened: boolean }[] = [];
  speakingUsers = new Set<string>();

  // DM
  dmConversations: DmConversation[] = [];
  dmLoading = true;
  friends: FriendUser[] = [];
  pendingRequests: FriendUser[] = [];
  sentRequests: FriendUser[] = [];
  blockedUsers: FriendUser[] = [];
  selectedDm: DmConversation | null = null;
  dmMessages: ChatMessage[] = [];
  dmMessagesLoading = false;
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

  // UI toggles
  profileMenuOpen = false;
  dmOptionsOpen = false;
  profileUser: any = null;
  profileFavorites: any[] = [];
  profileFavoritesLoading = false;
  profileFavoritesError = '';
  profileConnections: any[] = [];
  profileAccounts: any[] = [];
  profileMusic: any[] = [];
  memberStatuses: Record<string, string> = {};

  // Context menu
  contextMenu: { x: number; y: number; msg: ChatMessage } | null = null;

  // Emoji picker popup (reactions)
  emojiPickerMsg: ChatMessage | null = null;
  emojiPickerPos = { x: 0, y: 0 };

  // Edit message
  editingMessageId: number | null = null;
  editingContent = '';

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

  // Confirmation
  confirmData: { message: string, action: () => void, confirmLabel: string, cancelLabel: string, showCancel: boolean } | null = null;

  constructor(
    private readonly chatService: ChatService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly voiceService: VoiceService,
    readonly theme: ThemeService,
    private readonly el: ElementRef,
    private readonly userStatus: UserStatusService,
    private readonly usersService: UsersService,
    private readonly xpService: XpService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.currentStatus = this.userStatus.currentStatus;
    this.userStatus.currentStatus$.subscribe((status: UserStatus) => {
      this.currentStatus = status;
      this.cdr.markForCheck();
    });
    this.viewMode = 'dm';
    this.loadServers();
    this.loadDmData();
    this.loadNotifications();
    this.connectSocket();
  }

  // ===== DATA LOADING =====
  // ===== DATA LOADING =====

  private loadDmData(): void {
    this.loadDmConversations();
    this.loadFriends();
  }

  private loadDmConversations(): void {
    this.dmLoading = true;
    this.chatService.getDmConversations().subscribe({
      next: (data) => {
        this.dmConversations = data;
        const newStatuses = { ...this.memberStatuses };
        for (const conv of data ?? []) {
          if (conv?.otherUserId && conv?.otherStatus) {
            newStatuses[String(conv.otherUserId)] = conv.otherStatus;
          }
        }
        this.memberStatuses = newStatuses;
        this.dmLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.dmLoading = false;
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
        const newStatuses = { ...this.memberStatuses };
        for (const friend of [...(data.accepted ?? []), ...(data.pending ?? []), ...(data.sent ?? [])]) {
          if (friend?.other_id && friend?.status) {
            newStatuses[String(friend.other_id)] = friend.status;
          }
        }
        this.memberStatuses = newStatuses;
        this.loadBlockedUsers();
        this.cdr.markForCheck();
      },
    });
  }

  private loadBlockedUsers(): void {
    this.chatService.getBlockedUsers().subscribe({
      next: (data: FriendUser[]) => {
        this.blockedUsers = data;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Error loading blocked users:', err),
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
    this.selectedDm = null;
  }

  openFriendsView(): void {
    this.viewMode = 'friends';
    this.selectedServer = null;
    this.selectedChannel = null;
    this.selectedDm = null;
    this.messages = [];
    this.dmMessages = [];
    this.dmOptionsOpen = false;
    this.serverDropdownOpen = false;
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

  // Open the create/join server UI
  openCreateServer(): void {
    this.viewMode = 'create-server';
    this.selectedServer = null;
    this.selectedChannel = null;
    this.selectedDm = null;
    this.messages = [];
    this.dmMessages = [];
    this.createServerView = 'pick';
    this.showCreateServer = true;
    this.serverDropdownOpen = false;
    this.cdr.markForCheck();
  }
  createServer(): void {
    const name = this.newServerName.trim();
    if (!name) return;
    this.creatingServer = true;
    this.chatService.createServer(name).subscribe({
      next: (server) => {
        this.servers = [...this.servers, server];
        this.creatingServer = false;
        this.viewMode = 'server';
        this.selectServer(server);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.creatingServer = false;
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

  // ===== MESSAGES (Server) =====

  private loadMessages(channelId: number): void {
    this.messagesLoading = true;
    this.http.get<ChatMessage[]>(`${this.apiUrl}/gg/history?channel=${channelId}&limit=50`).subscribe({
      next: (msgs) => {
        this.messages = msgs;
        this.messagesLoading = false;
        this.loadReactionsForMessages(msgs, 'server');
        this.cdr.markForCheck();
        this.scrollToBottom(true);
      },
      error: () => {
        this.messagesLoading = false;
        this.cdr.markForCheck();
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
        this.scrollToBottom(true);
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

  private scrollToBottom(force = false): void {
    setTimeout(() => {
      const el = document.querySelector('.gg-messages, .gg-dm-messages') as HTMLElement | null;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (!force && !nearBottom) return;
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } catch {
        el.scrollTop = el.scrollHeight;
      }
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
    this.membersLoading = true;
    this.chatService.getServerMembers(serverId).subscribe({
      next: (data) => {
        this.members = data ?? [];
        const seededStatuses = { ...this.memberStatuses };
        for (const member of this.members) {
          const memberId = String(member.user_id ?? '');
          if (!memberId) continue;
          seededStatuses[memberId] = member.status ?? seededStatuses[memberId] ?? 'invisible';
        }
        this.memberStatuses = seededStatuses;
        this.membersLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.membersLoading = false;
        this.cdr.markForCheck();
      },
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

  showCyberConfirm(message: string, action: () => void, confirmLabel = 'Confirm', cancelLabel = 'Cancel'): void {
    this.confirmData = { message, action, confirmLabel, cancelLabel, showCancel: true };
  }

  showCyberAlert(message: string): void {
    this.confirmData = { message, action: () => { this.confirmData = null; }, confirmLabel: 'OK', cancelLabel: '', showCancel: false };
  }

  executeConfirm(): void {
    if (this.confirmData?.action) {
      this.confirmData.action();
    }
    this.confirmData = null;
  }

  cancelConfirm(): void {
    this.confirmData = null;
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
        this.speakingUsers.clear();
      this.speakingUsers.clear();
    this.cdr.markForCheck();
    try {
      const currentUserId = this.auth.getCurrentUser()?.id;
      this.voiceMembers = currentUserId ? [{ userId: currentUserId, muted: false, deafened: false }] : [];

      this.voiceService.onMemberJoined = (userId, _channelId, muted, deafened) => {
        if (!this.voiceMembers.find(m => m.userId === userId)) {
          this.voiceMembers = [...this.voiceMembers, { userId, muted, deafened }];
          this.cdr.markForCheck();
        }
      };
      this.voiceService.onMemberLeft = (userId) => {
        this.voiceMembers = this.voiceMembers.filter(m => m.userId !== userId);
          this.speakingUsers.delete(userId);
        this.cdr.markForCheck();
      };
      this.voiceService.onExistingMembers = (members) => {
        for (const member of members) {
          if (!this.voiceMembers.find(m => m.userId === member.userId)) {
            this.voiceMembers = [...this.voiceMembers, member];
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
    this.voiceService.onUserSpeaking = null;
    this.voiceService.onUserStoppedSpeaking = null;
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
        this.loadReactionsForMessages(msgs, 'dm');
        this.cdr.markForCheck();
        this.scrollToBottom(true);
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
        this.scrollToBottom(true);
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

    this.socket.on('user-status', (payload: any) => {
      const userId = String(payload?.userId ?? payload?.user_id ?? '');
      const isSelf = userId && this.currentUser?.id && String(userId) === String(this.currentUser.id);
      const resolvedStatus = isSelf
        ? (payload?.sys_status ?? payload?.status ?? payload?.visibleStatus)
        : (payload?.status ?? payload?.visibleStatus ?? payload?.sys_status);

      if (userId && resolvedStatus) {
        this.memberStatuses = { ...this.memberStatuses, [userId]: resolvedStatus };

        const member = this.members.find(m => String(m.user_id) === userId);
        if (member) {
          member.status = resolvedStatus;
          this.members = [...this.members];
        }
      }

      if (isSelf && resolvedStatus) {
        this.currentStatus = resolvedStatus;
      }

      this.cdr.markForCheck();
    });

    this.socket.on('message', (msg: ChatMessage) => {
      if (this.viewMode === 'server' && this.selectedChannel && msg.channel_id === String(this.selectedChannel.id)) {
        this.messages = [...this.messages, msg];
        this.cdr.markForCheck();
        this.scrollToBottom(true);
      }
    });

    this.socket.on('dm-message', (msg: ChatMessage) => {
      const convId = msg.channel_id?.startsWith('dm_') ? Number(msg.channel_id.replace('dm_', '')) : null;
      if (this.viewMode === 'dm' && this.selectedDm && convId === this.selectedDm.id) {
        this.dmMessages = [...this.dmMessages, msg];
        this.cdr.markForCheck();
        this.scrollToBottom(true);
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
    if (this.contextMenu) {
      const target = event.target as HTMLElement;
      if (!target.closest('.cyber-context-menu')) {
        this.closeContextMenu();
      }
    }

    if (this.emojiPickerMsg) {
      const target = event.target as HTMLElement;
      if (!target.closest('.emoji-picker-popup') && !target.closest('.emoji-picker-popup-backdrop')) {
        this.closeEmojiPicker();
      }
    }

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
    if (this.confirmData) { this.cancelConfirm(); this.cdr.markForCheck(); }
    if (this.contextMenu) { this.closeContextMenu(); this.cdr.markForCheck(); }
    if (this.emojiPickerMsg) { this.closeEmojiPicker(); this.cdr.markForCheck(); }
    if (this.serverDropdownOpen) { this.closeServerDropdown(); this.cdr.markForCheck(); }
    if (this.showServerSettings) { this.showServerSettings = false; this.cdr.markForCheck(); }
    if (this.showCreateServer) { this.showCreateServer = false; this.cdr.markForCheck(); }
    if (this.showCreateChannel) { this.showCreateChannel = false; this.cdr.markForCheck(); }
    if (this.showFriendsList) { this.showFriendsList = false; this.cdr.markForCheck(); }
    if (this.showAddFriend) { this.showAddFriend = false; this.cdr.markForCheck(); }
    if (this.showInviteLinks) { this.closeInviteLinks(); this.cdr.markForCheck(); }
    if (this.showJoinServer) { this.showJoinServer = false; this.cdr.markForCheck(); }
  }

  @HostListener('window:blur')
  handleWindowBlur(): void {
    if (this.contextMenu) {
      this.closeContextMenu();
      this.cdr.markForCheck();
    }
    if (this.emojiPickerMsg) {
      this.closeEmojiPicker();
      this.cdr.markForCheck();
    }
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
    this.userStatus.setStatus(status as UserStatus);
  }

  // ===== DM STATUS HELPERS =====

  dmStatus(otherUserId: string): string {
    return this.memberStatuses[otherUserId] ?? 'invisible';
  }

  dmFriendStatus(): string {
    if (!this.selectedDm) return 'invisible';
    return this.memberStatuses[this.selectedDm.otherUserId] ?? 'invisible';
  }

  toggleDmVoice(): void {
    // DM voice call placeholder — wire to VoiceService as needed
  }

  showUserProfile(conv: DmConversation | null): void {
    if (!conv) return;
    const c = conv as any;
    this.openProfile({
      id: c.otherUserId,
      username: c.otherUsername,
      avatar_url: c.otherAvatar ?? c.avatar_url ?? null,
    });
  }

  getDmOptions(): DropdownItem[] {
    const isBlocked = this.selectedDm && this.blockedUsers.some(u => u.other_id === this.selectedDm!.otherUserId);
    
    const options: DropdownItem[] = [
      {
        label: isBlocked ? 'Unblock User' : 'Block User',
        icon: isBlocked ? 'person_add' : 'block',
        action: () => this.toggleBlockUser(this.selectedDm?.otherUserId || ''),
      },
      {
        label: `Delete for me and ${this.selectedDm?.otherUsername}`,
        icon: 'delete_forever',
        action: () => this.deleteForBoth(),
      },
      {
        label: 'Delete for me',
        icon: 'delete',
        action: () => this.deleteForMe(),
      },
    ];
    
    return options;
  }

  handleDmOption(item: DropdownItem): void {
    item.action?.();
    this.dmOptionsOpen = false;
    this.cdr.markForCheck();
  }

  toggleBlockUser(userId: string): void {
    const isBlocked = this.blockedUsers.some(u => u.other_id === userId);
    
    if (isBlocked) {
      this.chatService.unblockUser(userId).subscribe({
        next: () => {
          this.blockedUsers = this.blockedUsers.filter(u => u.other_id !== userId);
          this.dmOptionsOpen = false;
        },
        error: (err) => console.error('Error unblocking user:', err),
      });
    } else {
      this.chatService.blockUser(userId).subscribe({
        next: () => {
          const friend = this.friends.find(f => f.other_id === userId);
          if (friend) {
            friend.blocked = true;
            this.blockedUsers.push(friend);
          }
          this.dmOptionsOpen = false;
        },
        error: (err) => console.error('Error blocking user:', err),
      });
    }
  }

  deleteForBoth(): void {
    if (!this.selectedDm) return;
    
    this.showCyberConfirm(
      `Delete this conversation with ${this.selectedDm.otherUsername} for both of you?`,
      () => {
        this.chatService.deleteDmConversation(this.selectedDm!.id).subscribe({
          next: () => {
            this.dmConversations = this.dmConversations.filter(c => c.id !== this.selectedDm?.id);
            this.selectedDm = null;
            this.dmMessages = [];
            this.dmOptionsOpen = false;
            this.viewMode = 'friends';
            this.cdr.markForCheck();
          },
          error: (err) => console.error('Error deleting conversation:', err),
        });
      },
      'Delete',
      'Cancel'
    );
  }

  deleteForMe(): void {
    if (!this.selectedDm) return;
    
    this.showCyberConfirm(
      `Delete this conversation for you only?`,
      () => {
        this.chatService.deleteDmConversation(this.selectedDm!.id).subscribe({
          next: () => {
            this.dmConversations = this.dmConversations.filter(c => c.id !== this.selectedDm?.id);
            this.selectedDm = null;
            this.dmMessages = [];
            this.dmOptionsOpen = false;
            this.viewMode = 'friends';
            this.cdr.markForCheck();
          },
          error: (err) => console.error('Error deleting conversation:', err),
        });
      },
      'Delete',
      'Cancel'
    );
  }

  // ===== VOICE CHANNEL USERS =====



  // ===== EDIT MESSAGE =====

  startEdit(msg: ChatMessage): void {
    this.editingMessageId = msg.id ?? null;
    this.editingContent = msg.content ?? '';
  }

  saveEdit(): void {
    if (this.editingMessageId == null) return;
    const content = this.editingContent.trim();
    if (!content) return;
    const isServer = this.viewMode === 'server';
    const req = isServer
      ? this.http.patch<ChatMessage>(`${this.apiUrl}/gg/messages/${this.editingMessageId}`, { content })
      : this.http.patch<ChatMessage>(`${this.apiUrl}/gg/dm/messages/${this.editingMessageId}`, { content });
    req.subscribe({
      next: (updated) => {
        if (isServer) {
          this.messages = this.messages.map(m => m.id === updated.id ? updated : m);
        } else {
          this.dmMessages = this.dmMessages.map(m => m.id === updated.id ? updated : m);
        }
        this.cancelEdit();
        this.cdr.markForCheck();
      },
      error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to edit message'),
    });
  }

  cancelEdit(): void {
    this.editingMessageId = null;
    this.editingContent = '';
  }

  deleteMessage(msg: ChatMessage): void {
    const isServer = this.viewMode === 'server';
    const req = isServer
      ? this.http.delete(`${this.apiUrl}/gg/messages/${msg.id}`)
      : this.http.delete(`${this.apiUrl}/gg/dm/messages/${msg.id}`);
    req.subscribe({
      next: () => {
        if (isServer) {
          this.messages = this.messages.filter(m => m.id !== msg.id);
        } else {
          this.dmMessages = this.dmMessages.filter(m => m.id !== msg.id);
        }
        this.cdr.markForCheck();
      },
      error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to delete message'),
    });
  }

  // ===== CONTEXT MENU =====

  openContextMenu(event: MouseEvent, msg: ChatMessage): void {
    event.preventDefault();
    this.contextMenu = { x: event.clientX, y: event.clientY, msg };
    this.cdr.markForCheck();
  }

  closeContextMenu(): void {
    this.contextMenu = null;
  }

  openEmojiPickerFromCtx(event: MouseEvent, msg: ChatMessage): void {
    event.stopPropagation();
    this.emojiPickerMsg = msg;
    this.emojiPickerPos = { x: event.clientX, y: event.clientY + 5 };
    this.closeContextMenu();
    this.cdr.markForCheck();
  }

  openEmojiPickerFromBar(msg: ChatMessage, event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.emojiPickerMsg = msg;
    this.emojiPickerPos = { x: rect.left, y: rect.top - 10 };
    this.cdr.markForCheck();
  }

  closeEmojiPicker(): void {
    this.emojiPickerMsg = null;
  }

  onEmojiPickerSelect(emoji: string): void {
    if (!this.emojiPickerMsg) return;
    this.toggleReaction(this.emojiPickerMsg, emoji);
    this.closeEmojiPicker();
  }

  // ===== AVATAR HELPERS =====

  defaultAvatar(): string {
    return 'assets/default-avatar.png';
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) img.src = this.defaultAvatar();
  }

  resolveAvatar(user: any, ...keys: string[]): string {
    if (!user) return this.defaultAvatar();
    for (const key of keys) {
      if (user[key]) return user[key];
    }
    return this.defaultAvatar();
  }

  // ===== VOICE MEMBER HELPERS =====

  voiceMemberSpeaking(userId: string): boolean {
    return this.speakingUsers.has(userId);
  }

  voiceMemberMuted(userId: string): boolean {
    return this.voiceMembers.find(m => m.userId === userId)?.muted ?? false;
  }

  voiceMemberDeafened(userId: string): boolean {
    return this.voiceMembers.find(m => m.userId === userId)?.deafened ?? false;
  }

  memberStatus(userId: string): string {
    const mapped = this.memberStatuses[userId];
    if (mapped) return mapped;
    const member = this.members.find(m => String(m.user_id) === String(userId));
    return member?.status ?? 'invisible';
  }

  tierColor(tier?: string): string {
    const colors: Record<string, string> = {
      common: '#8c96a8', uncommon: '#00e676', rare: '#5fb6ff',
      epic: '#aa44ff',   legendary: '#ffd700',
    };
    return colors[tier ?? 'common'] || '#8c96a8';
  }

  getPlatformLogo(id: string): string {
    const slugs: Record<string, string> = {
      steam: 'steam', discord: 'discord', gog: 'gogdotcom', epic: 'epicgames',
      ubisoft: 'ubisoft', ea: 'ea', spotify: 'spotify',
      youtube_music: 'youtubemusic', apple_music: 'applemusic',
    };
    return `https://cdn.simpleicons.org/${slugs[id] ?? id}/ffffff`;
  }

  // ===== PROFILE VIEW =====

  openProfile(user: any): void {
    this.profileUser = user;
    this.profileFavorites = [];
    this.profileFavoritesError = '';
    this.profileFavoritesLoading = false;
    this.profileConnections = [];
    this.viewMode = 'profile';
    const userId = String(user?.otherUserId ?? user?.id ?? '');
    if (userId) {
      // fetch full user details (display name, platforms, etc.)
      this.usersService.getUserDetails(userId).subscribe({
        next: (details) => {
          if (details) {
            this.profileUser = { ...this.profileUser, ...details };
          }
          this.cdr.markForCheck();
        },
        error: () => { /* ignore, keep minimal profile */ },
      });

      // fetch rank info
      this.xpService.getUserRank(userId).subscribe({
        next: (rank) => {
          if (rank) this.profileUser = { ...this.profileUser, rank };
          this.cdr.markForCheck();
        },
        error: () => {},
      });

      // fetch connections (try with user_id param; backend may need update)
      this.http.get<any[]>(`${this.apiUrl}/platform/connections?user_id=${userId}`).subscribe({
        next: (conns) => {
          this.profileConnections = conns ?? [];
          this.profileAccounts = (this.profileConnections ?? []).filter(c => (c.type || 'accounts') === 'accounts');
          this.profileMusic = (this.profileConnections ?? []).filter(c => (c.type || '') === 'music');
          this.cdr.markForCheck();
        },
        error: () => { this.profileConnections = []; this.profileAccounts = []; this.profileMusic = []; },
      });

      this.loadProfileFavorites(userId);
    }
  }

  closeProfile(): void {
    this.profileUser = null;
    this.profileFavorites = [];
    this.profileFavoritesError = '';
    this.profileFavoritesLoading = false;
    this.profileConnections = [];
    this.viewMode = this.selectedServer ? 'server' : 'dm';
  }

  private loadProfileFavorites(userId: string): void {
    this.profileFavoritesLoading = true;
    this.chatService.getUserShowcase(userId).subscribe({
      next: (cards) => {
        this.profileFavorites = (cards ?? []).slice(0, 10);
        this.profileFavoritesLoading = false;
        this.profileFavoritesError = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.profileFavorites = [];
        this.profileFavoritesLoading = false;
        this.profileFavoritesError = err?.error?.message || 'Failed to load favorites';
        this.cdr.markForCheck();
      },
    });
  }

  profileStatus(): string {
    if (!this.profileUser) return 'invisible';
    return this.memberStatuses[this.profileUser.id ?? this.profileUser.otherUserId] ?? 'invisible';
  }

  handleFriendsDm(userId: string | any): void {
    this.closeProfile();
    this.startDmWithUser(typeof userId === 'string' ? userId : String(userId));
  }

  // ===== CREATE SERVER FLOW =====

  showCreateForm(): void {
    this.createServerView = 'create';
    this.newServerName = '';
    this.newServerAvatarPreview = null;
    this.newServerAvatarFile = null;
  }

  openJoinServer(): void {
    this.createServerView = 'join';
    this.joinCode = '';
    this.joinError = '';
  }

  backToPick(): void {
    this.createServerView = 'pick';
  }

  onServerAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.newServerAvatarFile = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      this.newServerAvatarPreview = reader.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(this.newServerAvatarFile);
  }

  // ===== REACTIONS =====

  messageReactions: Record<string, Record<string, { count: number; userIds: string[] }>> = {};

  reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎮', '⭐'];

  getReactionKey(msgId: number, source: string): string {
    return `${source}:${msgId}`;
  }

  getReactions(msgId: number, source: string): { emoji: string; count: number; userIds: string[] }[] {
    const key = this.getReactionKey(msgId, source);
    const reactions = this.messageReactions[key];
    if (!reactions) return [];
    return Object.entries(reactions).map(([emoji, data]) => ({ emoji, ...data }));
  }

  hasReacted(msgId: number, source: string, emoji: string): boolean {
    const key = this.getReactionKey(msgId, source);
    const reactions = this.messageReactions[key]?.[emoji];
    return reactions?.userIds?.some(id => String(id) === String(this.currentUser?.id)) ?? false;
  }

  toggleReaction(msg: ChatMessage, emoji: string): void {
    const source = this.viewMode === 'dm' ? 'dm' : 'server';
    if (this.hasReacted(msg.id!, source, emoji)) {
      this.chatService.removeMessageReaction(msg.id!, source, emoji).subscribe({
        next: () => this.loadReactionsForMessage(msg.id!, source),
      });
    } else {
      this.chatService.addMessageReaction(msg.id!, source, emoji).subscribe({
        next: () => this.loadReactionsForMessage(msg.id!, source),
      });
    }
  }

  onContextEmoji(emoji: string): void {
    if (!this.contextMenu) return;
    this.toggleReaction(this.contextMenu.msg, emoji);
    this.closeContextMenu();
  }

  private loadReactionsForMessage(msgId: number, source: string): void {
    this.chatService.getMessageReactions([msgId], source).subscribe({
      next: (data) => {
        const key = this.getReactionKey(msgId, source);
        const grouped: Record<string, { count: number; userIds: string[] }> = {};
        for (const r of data) {
          grouped[r.emoji] = { count: r.count, userIds: r.user_ids || [] };
        }
        this.messageReactions[key] = grouped;
        this.cdr.markForCheck();
      },
    });
  }

  loadReactionsForMessages(msgs: ChatMessage[], source: string): void {
    const ids = msgs.map(m => m.id).filter((id): id is number => id != null);
    if (ids.length === 0) return;
    this.chatService.getMessageReactions(ids, source).subscribe({
      next: (data) => {
        for (const r of data) {
          const key = this.getReactionKey(r.message_id, source);
          if (!this.messageReactions[key]) this.messageReactions[key] = {};
          this.messageReactions[key][r.emoji] = { count: r.count, userIds: r.user_ids || [] };
        }
        this.cdr.markForCheck();
      },
    });
  }

  // ===== CARD COLLECTION (DM TRADE ONLY) =====

  showCardTrading = false;
  cardTrades: any[] = [];

  openCardTrading(): void {
    this.showCardTrading = true;
    this.chatService.getCardTrades().subscribe({
      next: (trades) => { this.cardTrades = trades; this.cdr.markForCheck(); },
    });
  }

  acceptCardTrade(tradeId: number): void {
    this.chatService.acceptCardTrade(tradeId).subscribe({
      next: () => { this.openCardTrading(); },
    });
  }

  rejectCardTrade(tradeId: number): void {
    this.chatService.rejectCardTrade(tradeId).subscribe({ next: () => this.openCardTrading() });
  }

  cancelCardTrade(tradeId: number): void {
    this.chatService.cancelCardTrade(tradeId).subscribe({ next: () => this.openCardTrading() });
  }

  formatPlatformName(platform: string): string {
    const names: { [key: string]: string } = {
      discord: 'Discord',
      steam: 'Steam',
      twitch: 'Twitch',
      youtube: 'YouTube',
      youtube_music: 'YouTube Music',
      spotify: 'Spotify',
      github: 'GitHub',
      twitter: 'Twitter',
      reddit: 'Reddit',
    };
    return names[platform] || platform.charAt(0).toUpperCase() + platform.slice(1).replace(/_/g, ' ');
  }

  ngOnDestroy(): void {
    if (this.voiceConnected) this.leaveVoice();
  }
}