import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, NO_ERRORS_SCHEMA, effect, ViewChild } from '@angular/core';
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
import { MemberHoverCardComponent } from '../../components/member-hover-card/member-hover-card.component';
import { ServerProfileEditorComponent } from '../../components/server-profile-editor/server-profile-editor.component';
import { ServerListComponent } from './server-list/server-list.component';
import { ChannelListComponent } from './channel-list/channel-list.component';
import { CyberConfirmComponent } from '../../components/cyber-confirm/cyber-confirm.component';
import { GgCardTradingViewComponent } from '../../components/gg-card-trading-view/gg-card-trading-view.component';
import { CyberEmojiPickerComponent } from '../../components/cyber-emoji-picker/cyber-emoji-picker.component';
import { VoiceNudgeService } from '../../services/voice-nudge.service';
import { SoundService } from '../../services/sound.service';
import { CallService } from '../../services/call.service';
import { CyberCallComponent } from '../../components/cyber-call/cyber-call.component';
import { ScreenShareService, ScreenShareQuality } from '../../services/screen-share.service';

@Component({
  selector: 'app-gg-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, RouterModule, CyberDropdownComponent, CyberConfirmComponent, GgChatFriendsComponent, MemberListComponent, MemberHoverCardComponent, ServerProfileEditorComponent, ServerListComponent, ChannelListComponent, GgCardTradingViewComponent, CyberEmojiPickerComponent, CyberCallComponent],
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
  viewMode: 'dm' | 'server' | 'create-server' | 'create-channel' | 'profile' | 'friends' | 'trading' | 'trading-inline' | 'gift-inline' = 'dm';

  // Servers
  servers: GgServer[] = [];
  selectedServer: GgServer | null = null;
  serverProfileCache: Map<string, { avatar_url: string | null; banner_url: string | null }> = new Map();
  serverLoading = false;
  showCreateServer = false;
  newServerName = '';
  newServerAvatarPreview: string | null = null;
  newServerAvatarFile: File | null = null;
  createServerView: 'pick' | 'create' | 'join' = 'pick';
  creatingServer = false;

  // Channels
  channels: GgChannel[] = [];
  categories: any[] = [];
  selectedChannel: GgChannel | null = null;
  channelLoading = false;
  showCreateChannel = false;
  newChannelName = '';
  newChannelType: 'text' | 'voice' = 'text';
  newChannelPrivate = false;
  newChannelCategory = '';

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
  showScrollToBottom = false;
  chatFooterInfo: string | null = null;
  private chatFooterInfoTimer: any = null;
  isCallOngoing = false;
  callExpanded = false;
  typingUsers: Map<string, { username: string; timer: any }> = new Map();
  private myTypingTimer: any = null;
  showCommandAutocomplete = false;
  filteredCommands: { cmd: string; desc: string; permission?: string }[] = [];
  commandIndex = 0;
  private readonly commands: { cmd: string; desc: string; permission?: string }[] = [
    { cmd: '/clear', desc: 'Clear recent messages', permission: 'manage_messages' },
  ];

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

  get typingText(): string {
    const names = Array.from(this.typingUsers.values()).map(t => t.username);
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]} and ${names.length - 1} others are typing...`;
  }

  get gifQuery(): string {
    return this.gifSearchQuery;
  }

  set gifQuery(value: string) {
    this.gifSearchQuery = value;
  }

  isInVoiceView(): boolean {
    return this.viewMode === 'server' && this.selectedChannel?.type === 'voice' && this.voiceConnected;
  }

  // Members
  members: GgServerMember[] = [];
  membersLoading = false;
  serverRoles: any[] = [];

  // Voice
  voiceConnected = false;
  voiceChannelId: string | null = null;
  voiceGuildId: string | null = null;
  voiceMuted = localStorage.getItem('voiceMuted') === 'true';
  voiceDeafened = localStorage.getItem('voiceDeafened') === 'true';
  noiseSuppressionEnabled = true;
  showMutedWarning = false;
  mutedFeedbackAlert: string | null = null;
  mutedFeedbackIsDeafened = false;
  private mutedFeedbackTimer: any = null;
  private mutedFeedbackSuppressedUntil = 0;
  private mutedWarningTimer: any = null;
  voiceConnecting = false;
  showSoundboard = false;
  soundboardPlaying = false;
  soundboardSounds: { id: number; name: string; file_url: string }[] = [];
  soundboardUploading = false;
  soundboardUsers = new Set<string>();
  newSoundboardName = '';
  voiceMembers: { userId: string; muted: boolean; deafened: boolean }[] = [];
  allVoiceChannels: { channelId: string; users: { userId: string; muted: boolean; deafened: boolean; speaking: boolean }[] }[] = [];
  speakingUsers = new Set<string>();
  localMicActive = false;
  micPermissionError: string | null = null;
  micDeviceDisconnected = false;
  // Audio device selection
  audioInputDevices: MediaDeviceInfo[] = [];
  audioOutputDevices: MediaDeviceInfo[] = [];
  selectedInputId: string = 'default';
  selectedOutputId: string = 'default';
  showDevicePicker = false;

  // Screen share state
  isScreenSharing = false;
  remoteScreenSharer: { userId: string; quality: ScreenShareQuality; hasAudio: boolean; element: HTMLVideoElement; audioElement: HTMLAudioElement | null } | null = null;
  screenSharePanelCollapsed = false;
  showScreenShareQualityMenu = false;
  screenSharePendingAudio = false;
  screenShareShareAudio = false;
  screenShareQuality: ScreenShareQuality = '720p';
  screenShareError: string | null = null;
  @ViewChild('screenShareContainer', { static: false }) screenShareContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('screenShareSelfView', { static: false }) screenShareSelfView?: ElementRef<HTMLDivElement>;

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
  profileServerId: number | null = null;
  profileServerProfile: any = null;
  serverProfileEditorOpen = false;
  profileFavorites: any[] = [];
  profileFavoritesLoading = false;
  rankImgLoaded = false;
  avatarImgLoaded = false;
  profileFavoritesError = '';
  profileConnections: any[] = [];
  profileAccounts: any[] = [];
  profileMusic: any[] = [];
  memberStatuses: Record<string, string> = {};
  private pendingServerId: string | null = null;
  private pendingChannelId: string | null = null;
  private pendingDmId: string | null = null;
  tradeFilterUserId = '';
  tradeFilterUsername = '';
  tradeFilterAvatar: string | null = null;
  focusTradeId: number | null = null;

  // Context menu
  contextMenu: { x: number; y: number; msg: ChatMessage } | null = null;
  voiceContextMenu: { x: number; y: number; vm: any } | null = null;
  memberPanelContextMenu: { x: number; y: number; member: any } | null = null;

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
    private readonly nudgeService: VoiceNudgeService,
    private readonly soundService: SoundService,
    private readonly callService: CallService,
    private readonly screenShare: ScreenShareService,
  ) {
    // Sync theme color to voice channel when it changes
    effect(() => {
      const _theme = this.theme.currentTheme();
      const _custom = this.theme.customColor();
      // Read both signals so this re-runs when either changes
      if (this.voiceService.connected) {
        const color = _theme === 'custom' ? _custom : this.voiceService.getThemeColor(_theme);
        this.voiceService.updateThemeColor(color);
      }
    });
  }

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    this.soundService.init();
    this.callService.init();
    this.callService.activeCall$.subscribe(call => {
      this.isCallOngoing = !!call;
      this.cdr.markForCheck();
      if (call && call.channelId && call.guildId) {
        this.voiceService.joinChannel(call.guildId, call.channelId);
      }
    });
    this.callService.outgoingCall$.subscribe(call => {
      if (call) this.isCallOngoing = true;
      else this.isCallOngoing = !!this.callService.currentActiveCall;
      this.cdr.markForCheck();
    });
    this.callService.navigateToDm$.subscribe(userId => {
      const conv = this.dmConversations.find(c => c.otherUserId === userId);
      if (conv) {
        this.selectDm(conv);
      }
    });
    this.noiseSuppressionEnabled = this.voiceService.isNoiseSuppressionEnabled();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.currentStatus = this.userStatus.currentStatus;
    this.userStatus.currentStatus$.subscribe((status: UserStatus) => {
      this.currentStatus = status;
      this.cdr.markForCheck();
    });
    // Check if a header-nav trade notification requested a focus
    try {
      const raw = sessionStorage.getItem('gg_trade_focus');
      if (raw) {
        const payload = JSON.parse(raw);
        sessionStorage.removeItem('gg_trade_focus');
        if (payload?.tradeId) {
          this.focusTradeId = Number(payload.tradeId);
          this.tradeFilterUserId = payload.otherUserId || '';
          this.tradeFilterUsername = payload.otherUsername || '';
          this.tradeFilterAvatar = payload.otherAvatar || null;
          this.viewMode = 'trading';
        }
      }
    } catch { /* non-critical */ }
    if (this.viewMode !== 'trading') {
      const saved = localStorage.getItem('gg_chat_view') as 'dm' | 'server' | 'friends' | 'trading' | 'trading-inline' | 'gift-inline' | 'profile' | null;
      this.viewMode = (saved && ['dm', 'server', 'friends', 'trading', 'trading-inline', 'gift-inline', 'profile'].includes(saved)) ? saved : 'dm';
      if (this.viewMode === 'server') {
        this.pendingServerId = localStorage.getItem('gg_chat_server');
        this.pendingChannelId = localStorage.getItem('gg_chat_channel');
      }
      if (this.viewMode === 'dm') {
        const dmId = localStorage.getItem('gg_chat_dm');
        if (dmId) this.pendingDmId = dmId;
      }
      if (this.viewMode === 'trading' || this.viewMode === 'trading-inline' || this.viewMode === 'gift-inline') {
        this.tradeFilterUserId = localStorage.getItem('gg_chat_trade_user') || '';
        this.tradeFilterUsername = localStorage.getItem('gg_chat_trade_name') || '';
        this.tradeFilterAvatar = localStorage.getItem('gg_chat_trade_avatar') || null;
        const focusId = localStorage.getItem('gg_chat_trade_focus');
        if (focusId) this.focusTradeId = Number(focusId);
      }
      if (this.viewMode === 'profile') {
        const profileUserId = localStorage.getItem('gg_chat_profile');
        if (profileUserId) {
          this.viewMode = 'dm';
          this.usersService.getUserDetails(profileUserId).subscribe({
            next: (details) => {
              if (details) {
                this.openProfile({ ...details, otherUserId: details.id, otherUsername: details.username, id: details.id });
              }
            },
            error: () => {},
          });
        }
      }
    }
    this.loadServers();
    this.loadDmData();
    this.loadNotifications();
    this.connectSocket();

    // No auto-reconnect to voice on page load. The user must explicitly
    // click a voice channel to join, even if they were on voice before
    // the refresh. (The backend drops the user on socket disconnect
    // anyway; we just don't try to silently rejoin.)
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
        if (this.pendingDmId && data) {
          const match = data.find(c => String(c.id) === this.pendingDmId);
          this.pendingDmId = null;
          if (match) {
            this.selectDm(match);
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.dmLoading = false;
        this.pendingDmId = null;
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
        if (this.pendingServerId) {
          const match = this.servers.find(s => String(s.id) === this.pendingServerId);
          this.pendingServerId = null;
          if (match) {
            this.selectServer(match);
          } else {
            this.viewMode = 'dm';
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.serverLoading = false;
        this.loading = false;
        this.pendingServerId = null;
        this.cdr.markForCheck();
      },
    });
  }

  private persistView(): void {
    localStorage.setItem('gg_chat_view', this.viewMode);
    if (this.selectedServer) {
      localStorage.setItem('gg_chat_server', String(this.selectedServer.id));
    } else {
      localStorage.removeItem('gg_chat_server');
    }
    if (this.selectedChannel) {
      localStorage.setItem('gg_chat_channel', String(this.selectedChannel.id));
    } else {
      localStorage.removeItem('gg_chat_channel');
    }
    if (this.selectedDm) {
      localStorage.setItem('gg_chat_dm', String(this.selectedDm.id));
    } else {
      localStorage.removeItem('gg_chat_dm');
    }
    if (this.profileUser) {
      const userId = String(this.profileUser.otherUserId ?? this.profileUser.id ?? '');
      if (userId) localStorage.setItem('gg_chat_profile', userId);
    } else {
      localStorage.removeItem('gg_chat_profile');
    }
    if (this.viewMode === 'trading' || this.viewMode === 'trading-inline' || this.viewMode === 'gift-inline') {
      if (this.tradeFilterUserId) localStorage.setItem('gg_chat_trade_user', this.tradeFilterUserId);
      if (this.tradeFilterUsername) localStorage.setItem('gg_chat_trade_name', this.tradeFilterUsername);
      if (this.tradeFilterAvatar) localStorage.setItem('gg_chat_trade_avatar', this.tradeFilterAvatar);
      if (this.focusTradeId) localStorage.setItem('gg_chat_trade_focus', String(this.focusTradeId));
    } else if (this.viewMode !== 'profile') {
      localStorage.removeItem('gg_chat_trade_user');
      localStorage.removeItem('gg_chat_trade_name');
      localStorage.removeItem('gg_chat_trade_avatar');
      localStorage.removeItem('gg_chat_trade_focus');
    }
  }

  goToDms(): void {
    this.viewMode = 'dm';
    this.persistView();
    this.selectedServer = null;
    this.selectedChannel = null;
    this.messages = [];
    this.selectedDm = null;
  }

  openFriendsView(): void {
    this.viewMode = 'friends';
    this.persistView();
    this.selectedServer = null;
    this.selectedChannel = null;
    this.selectedDm = null;
    this.messages = [];
    this.dmMessages = [];
    this.dmOptionsOpen = false;
    this.serverDropdownOpen = false;
  }

  openTradingView(): void {
    this.viewMode = 'trading';
    this.persistView();
    this.selectedServer = null;
    this.selectedChannel = null;
    this.selectedDm = null;
    this.messages = [];
    this.dmMessages = [];
    this.dmOptionsOpen = false;
    this.serverDropdownOpen = false;
    this.loadCardTrades();
  }

  selectServer(server: GgServer): void {
    this.viewMode = 'server';
    this.selectedServer = server;
    this.selectedChannel = null;
    this.messages = [];
    this.selectedDm = null;
    this.dmMessages = [];
    this.serverProfileCache.clear();
    this.persistView();
    this.loadChannels(server.id);
    this.loadMembers(server.id);
    this.chatService.getServerRoles(server.id).subscribe({
      next: (roles) => { this.serverRoles = roles ?? []; this.cdr.markForCheck(); },
      error: () => { this.serverRoles = []; },
    });
    this.chatService.getServerProfiles(server.id).subscribe({
      next: (profiles) => {
        this.serverProfileCache.clear();
        for (const p of profiles) {
          if (p.avatar_url || p.banner_url) {
            this.serverProfileCache.set(String(p.user_id), { avatar_url: p.avatar_url, banner_url: p.banner_url });
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {},
    });
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
        if (!this.servers.find(s => s.id === server.id)) {
          this.servers = [...this.servers, server];
        }
        this.creatingServer = false;
        // Auto-redirect to the new server's general channel
        this.selectServer(server);
        this.cdr.markForCheck();
        if (this.newServerAvatarFile) {
          this.chatService.uploadServerAvatar(server.id, this.newServerAvatarFile).subscribe({
            next: (updated) => {
              this.servers = this.servers.map(s => s.id === updated.id ? updated : s);
              if (this.selectedServer?.id === updated.id) {
                this.selectedServer = updated;
              }
              this.cdr.markForCheck();
            },
          });
        }
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
        this.chatService.getCategories(serverId).subscribe({
          next: (cats) => { this.categories = cats; this.cdr.markForCheck(); },
        });
        this.channelLoading = false;
        if (this.pendingChannelId) {
          const match = data.find(c => String(c.id) === this.pendingChannelId);
          this.pendingChannelId = null;
          if (match) {
            // Voice channels are NOT auto-joined — the user must click
            // the voice channel to join. Only auto-select non-voice channels.
            if (match.type !== 'voice') {
              this.selectChannel(match);
              this.cdr.markForCheck();
              return;
            }
          }
        }
        const first = data.find(c => c.type === 'text');
        if (first) this.selectChannel(first);
        this.cdr.markForCheck();
      },
      error: () => {
        this.channelLoading = false;
        this.pendingChannelId = null;
        this.cdr.markForCheck();
      },
    });
  }

  selectChannel(channel: GgChannel): void {
    this.selectedChannel = channel;
    this.selectedDm = null;
    this.persistView();
    if (channel.type === 'voice') {
      // User must explicitly click a voice channel to join. No
      // auto-rejoin, no auto-join on page load, no auto-join via
      // deep-link. toggleVoice handles the toggle-off case if the
      // user is already connected to this channel.
      if (!(this.voiceConnected && this.voiceChannelId === String(channel.id))) {
        this.toggleVoice(channel);
      }
      return;
    }
    this.dmMessages = [];
    this.loadMessages(channel.id);
  }

  openCreateChannel(): void {
    this.viewMode = 'create-channel';
    this.newChannelName = '';
    this.newChannelType = 'text';
    this.newChannelPrivate = false;
    this.newChannelCategory = '';
    this.cdr.markForCheck();
  }

  createChannel(): void {
    const name = this.newChannelName.trim();
    if (!name || !this.selectedServer) return;
    const allowedRoles = this.newChannelPrivate ? ['admin', 'moderator', 'member'] : undefined;
    const category = this.newChannelCategory.trim() || undefined;
    this.chatService.createChannel(this.selectedServer.id, name, this.newChannelType, allowedRoles, category).subscribe({
      next: () => {
        this.viewMode = 'server';
        this.cdr.markForCheck();
      },
      error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to create channel'),
    });
  }

  // ===== CHANNEL SETTINGS =====

  openChannelSettings(channel: GgChannel): void {
    if (this.selectedServer) {
      this.router.navigate(['/gg-chat/server', this.selectedServer.id, 'settings'], {
        queryParams: { tab: 'channels' },
      });
      return;
    }
    this.channelSettingsChannel = channel;
    this.channelSettingsRoles = [...(channel.allowed_roles ?? [])];
    this.showChannelSettings = true;
  }

  onCategoryUpdate(oldName: string, newName: string): void {
    if (!this.selectedServer) return;
    const channelsToUpdate = this.channels.filter(ch => (ch.category ?? '') === oldName);
    let done = 0;
    for (const ch of channelsToUpdate) {
      this.chatService.setChannelCategory(ch.id, newName).subscribe({
        next: () => {
          ch.category = newName;
          done++;
          if (done === channelsToUpdate.length) this.cdr.markForCheck();
        },
        error: () => {
          done++;
          if (done === channelsToUpdate.length) this.cdr.markForCheck();
        },
      });
    }
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
    this.showCyberConfirm(`Delete #${channel.name}?`, () => {
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
    }, 'Delete', 'Cancel');
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

  private handleCommand(text: string): boolean {
    const clearMatch = text.match(/^\/clear\s+(\d+)$/);
    if (clearMatch) {
      if (!this.selectedChannel || this.viewMode !== 'server') {
        this.showFooterInfo('/clear can only be used in server channels');
        return true;
      }
      if (!this.canManageMessages()) {
        this.showFooterInfo('You need the Manage Messages permission to use /clear');
        return true;
      }
      const count = Math.min(Math.max(parseInt(clearMatch[1], 10), 1), 100);
      this.sending = true;
      this.http.post<{ ok: boolean; deleted: number }>(`${this.apiUrl}/gg/channels/${this.selectedChannel.id}/clear`, { count }).subscribe({
        next: (res) => {
          this.sending = false;
          this.newMessage = '';
          this.showFooterInfo(`Cleared ${res.deleted} message${res.deleted !== 1 ? 's' : ''}`);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.sending = false;
          this.showFooterInfo(err.error?.message ?? 'Failed to clear messages');
          this.cdr.markForCheck();
        },
      });
      return true;
    }
    return false;
  }

  send(): void {
    const content = this.newMessage.trim();
    if (content.startsWith('/')) {
      if (this.handleCommand(content)) return;
    }
    if ((!content && !this.pendingAttachmentUrl) || this.sending || !this.selectedChannel) return;
    this.sending = true;
    this.chatService.sendGgMessage(content, String(this.selectedChannel.id), this.pendingAttachmentUrl ?? undefined, this.replyToMessage?.id).subscribe({
      next: (msg) => {
        if (!this.messages.some(m => m.id === msg.id)) {
          this.messages = [...this.messages, msg];
        }
        this.newMessage = '';
        this.pendingAttachmentUrl = null;
        this.replyToMessage = null;
        this.sending = false;
        if (this.myTypingTimer) {
          clearTimeout(this.myTypingTimer);
          this.myTypingTimer = null;
        }
        if (this.selectedChannel) {
          this.chatService.emitTypingStop(String(this.selectedChannel.id));
        }
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
      // Do not send when an autocomplete is active — Enter selects the highlighted item
      if (this.showCommandAutocomplete || this.showMentionAutocomplete) {
        // Let the autocomplete handlers below process Enter
      } else {
        event.preventDefault();
        this.sendMessage();
        return;
      }
    }
    if (event.key === 'Escape') {
      this.cancelReply();
      this.showGifPicker = false;
      this.showMentionAutocomplete = false;
      this.showCommandAutocomplete = false;
    }
    // Command autocomplete navigation
    if (this.showCommandAutocomplete) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.commandIndex = Math.min(this.commandIndex + 1, this.filteredCommands.length - 1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.commandIndex = Math.max(this.commandIndex - 1, 0);
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        if (this.filteredCommands[this.commandIndex]) {
          this.insertCommand(this.filteredCommands[this.commandIndex].cmd);
        }
      }
      return;
    }
    // Mention autocomplete navigation
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

    // Command autocomplete
    if (textBefore.startsWith('/') && !textBefore.includes(' ')) {
      const query = textBefore.toLowerCase();
      this.filteredCommands = this.commands.filter(c => c.cmd.startsWith(query));
      if (this.viewMode === 'server' && this.selectedChannel) {
        this.filteredCommands = this.filteredCommands;
      } else {
        this.filteredCommands = this.filteredCommands.filter(c => !c.permission);
      }
      this.showCommandAutocomplete = this.filteredCommands.length > 0;
      this.commandIndex = 0;
      this.showMentionAutocomplete = false;
    } else {
      this.showCommandAutocomplete = false;
    }

    // Mention autocomplete
    if (!this.showCommandAutocomplete) {
      const rolePrefixMatch = textBefore.match(/@role\s+(\w*)$/i);
      if (rolePrefixMatch) {
        // Typing after "@role " — show matching roles
        this.populateRoleMentionList(rolePrefixMatch[1]);
        this.mentionIndex = 0;
      } else {
        const atMatch = textBefore.match(/@(\w*)$/);
        if (atMatch) {
          const query = atMatch[1].toLowerCase();
          const results: any[] = [];
          // 1) @everyone — always first when query is empty or starts with 'e'
          if (this.selectedServer && (!query || 'everyone'.startsWith(query) || 'everyone'.includes(query))) {
            results.push({ __mention: 'everyone', username: 'everyone', display: '@everyone', color: '#ff5555' });
          }
          // 2) @role prefix option — when query is empty or starts with 'r'
          if (this.selectedServer && (!query || 'role'.startsWith(query) || 'role'.includes(query))) {
            results.push({ __mention: 'role-prefix', username: 'role', display: '@role', color: '#58a6ff' });
          }
          // 3) @username — match server members, sorted alphabetically
          const memberResults: any[] = [];
          for (const m of this.members) {
            if (!query || (m.username ?? '').toLowerCase().includes(query)) {
              memberResults.push(m);
            }
          }
          memberResults.sort((a, b) => (a.username ?? '').toLowerCase().localeCompare((b.username ?? '').toLowerCase()));
          results.push(...memberResults);
          this.filteredMentions = results.slice(0, 8);
          this.showMentionAutocomplete = this.filteredMentions.length > 0;
          this.mentionIndex = 0;
        } else {
          this.showMentionAutocomplete = false;
        }
      }
    }

    // Typing indicator
    if (this.messageText.trim() && this.selectedChannel) {
      if (!this.myTypingTimer) {
        this.chatService.emitTyping(String(this.selectedChannel.id), this.currentUser?.username ?? 'Someone');
      }
      if (this.myTypingTimer) clearTimeout(this.myTypingTimer);
      this.myTypingTimer = setTimeout(() => {
        this.myTypingTimer = null;
        if (this.selectedChannel) {
          this.chatService.emitTypingStop(String(this.selectedChannel.id));
        }
      }, 2000);
    } else if (this.myTypingTimer) {
      clearTimeout(this.myTypingTimer);
      this.myTypingTimer = null;
      if (this.selectedChannel) {
        this.chatService.emitTypingStop(String(this.selectedChannel.id));
      }
    }
  }

  insertMention(member: any): void {
    const textarea = document.querySelector('.chat-textarea') as HTMLTextAreaElement | null;
    const cursorPos = textarea?.selectionStart ?? this.messageText.length;
    const textBefore = this.messageText.slice(0, cursorPos);
    const textAfter = this.messageText.slice(cursorPos);
    // @role prefix: insert "@role " and immediately show the role list
    if (member.__mention === 'role-prefix') {
      const atIndex = textBefore.lastIndexOf('@');
      this.messageText = textBefore.slice(0, atIndex) + '@role ' + textAfter;
      this.showMentionAutocomplete = false;
      // Directly populate the role list so it shows immediately
      this.populateRoleMentionList('');
      this.mentionIndex = 0;
      this.cdr.markForCheck();
      setTimeout(() => textarea?.focus(), 0);
      return;
    }
    // Role picked from the @role sub-search — resolve to direct "@<rolename> " mention
    if (member.__mention === 'role') {
      const rolePrefixIdx = textBefore.toLowerCase().lastIndexOf('@role');
      if (rolePrefixIdx >= 0) {
        this.messageText = textBefore.slice(0, rolePrefixIdx) + '@' + member.username + ' ' + textAfter;
        this.showMentionAutocomplete = false;
        this.cdr.markForCheck();
        setTimeout(() => textarea?.focus(), 0);
        return;
      }
    }
    const atIndex = textBefore.lastIndexOf('@');
    this.messageText = textBefore.slice(0, atIndex) + '@' + member.username + ' ' + textAfter;
    this.showMentionAutocomplete = false;
  }

  insertCommand(cmd: string): void {
    this.messageText = cmd + ' ';
    this.showCommandAutocomplete = false;
    setTimeout(() => {
      const textarea = document.querySelector('.chat-textarea') as HTMLTextAreaElement | null;
      textarea?.focus();
    });
  }

  highlightMentions(content: string): string {
    if (!content) return '';
    const currentUsername = this.auth.getCurrentUser()?.username;
    return content.replace(/@(\w+)/g, (_, tag) => {
      const lower = tag.toLowerCase();
      if (lower === 'everyone') {
        return `<span class="mention mention-everyone">@everyone</span>`;
      }
      if (this.isRoleMention(tag)) {
        const isSelfRole = this.userHasRole(tag);
        const cls = isSelfRole ? 'mention mention-role mention-self-role' : 'mention mention-role';
        return `<span class="${cls}">@${tag}</span>`;
      }
      if (currentUsername && lower === currentUsername.toLowerCase()) {
        return `<span class="mention mention-self">@${tag}</span>`;
      }
      return `<span class="mention">@${tag}</span>`;
    });
  }

  private populateRoleMentionList(query: string): void {
    const q = query.toLowerCase();
    const results: any[] = [];
    if (this.selectedServer) {
      for (const r of this.serverRoles) {
        if (!q || (r.name ?? '').toLowerCase().includes(q)) {
          results.push({ __mention: 'role', username: r.name, display: '@' + r.name, color: r.color || '#58a6ff' });
        }
      }
      results.sort((a, b) => (a.username || '').toLowerCase().localeCompare((b.username || '').toLowerCase()));
    }
    this.filteredMentions = results.slice(0, 8);
    this.showMentionAutocomplete = this.filteredMentions.length > 0;
  }

  private isRoleMention(roleName: string): boolean {
    const builtIn = ['owner', 'admin', 'moderator', 'member'];
    if (builtIn.includes(roleName.toLowerCase())) return true;
    return this.serverRoles.some(r => r.name?.toLowerCase() === roleName.toLowerCase());
  }

  private userHasRole(roleName: string): boolean {
    const currentUserId = this.auth.getCurrentUser()?.id;
    if (!currentUserId) return false;
    const member = this.members.find(m => m.user_id === currentUserId);
    return member?.roles?.includes(roleName.toLowerCase()) ?? false;
  }

  isMessageHighlight(msg: any): boolean {
    const currentUserId = this.auth.getCurrentUser()?.id;
    if (!currentUserId) return false;
    if (msg.replyToMessage?.user_id === currentUserId) return true;
    const content = msg.content ?? '';
    if (/@everyone\b/i.test(content)) return true;
    const currentUsername = this.auth.getCurrentUser()?.username;
    if (currentUsername && new RegExp(`@${currentUsername}\\b`, 'i').test(content)) return true;
    const member = this.members.find(m => m.user_id === currentUserId);
    if (member?.roles) {
      for (const role of member.roles) {
        if (new RegExp(`@${role}\\b`, 'i').test(content)) return true;
      }
    }
    return false;
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

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.showScrollToBottom = distFromBottom > 200;
    this.cdr.markForCheck();
  }

  scrollToBottomClick(): void {
    const el = document.querySelector('.gg-messages, .gg-dm-messages') as HTMLElement | null;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
    this.showScrollToBottom = false;
  }

  showFooterInfo(message: string, durationMs = 4000): void {
    if (this.chatFooterInfoTimer) {
      clearTimeout(this.chatFooterInfoTimer);
      this.chatFooterInfoTimer = null;
    }
    this.chatFooterInfo = message;
    this.cdr.markForCheck();
    if (durationMs > 0) {
      this.chatFooterInfoTimer = setTimeout(() => {
        this.chatFooterInfo = null;
        this.chatFooterInfoTimer = null;
        this.cdr.markForCheck();
      }, durationMs);
    }
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

  canManageChannels(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    if (!me) return false;
    const roles: string[] = me.roles ?? [];
    if (roles.includes('owner') || roles.includes('admin')) return true;
    const builtInPerms: Record<string, string[]> = {
      admin: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members', 'manage_soundboard', 'control_voice'],
      moderator: ['manage_messages', 'kick_members', 'manage_soundboard', 'control_voice'],
      member: [],
    };
    for (const r of roles) {
      if ((builtInPerms[r] ?? []).includes('manage_channels')) return true;
      const customRole = this.serverRoles.find((sr: any) => sr.name === r);
      if (customRole && (customRole.permissions ?? []).includes('manage_channels')) return true;
    }
    return false;
  }

  canManageMessages(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    if (!me) return false;
    const roles: string[] = me.roles ?? [];
    if (roles.includes('owner') || roles.includes('admin')) return true;
    const builtInPerms: Record<string, string[]> = {
      admin: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members', 'manage_soundboard', 'control_voice'],
      moderator: ['manage_messages', 'kick_members', 'manage_soundboard', 'control_voice'],
      member: [],
    };
    for (const r of roles) {
      if ((builtInPerms[r] ?? []).includes('manage_messages')) return true;
      const customRole = this.serverRoles.find((sr: any) => sr.name === r);
      if (customRole && (customRole.permissions ?? []).includes('manage_messages')) return true;
    }
    return false;
  }

  canSendInChannel(channelId: number): boolean {
    const channel = this.channels.find(c => c.id === channelId);
    if (!channel || !channel.allowed_roles?.length) return true;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    return me?.roles?.some(role => channel.allowed_roles?.includes(role)) ?? false;
  }

  canKick(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const me = this.members.find(m => String(m.user_id) === String(this.currentUser?.id));
    if (!me) return false;
    const roles: string[] = me.roles ?? [];
    if (roles.includes('owner') || roles.includes('admin') || roles.includes('moderator')) return true;
    const builtInPerms: Record<string, string[]> = {
      admin: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members', 'manage_soundboard', 'control_voice'],
      moderator: ['manage_messages', 'kick_members', 'manage_soundboard', 'control_voice'],
      member: [],
    };
    for (const r of roles) {
      if ((builtInPerms[r] ?? []).includes('kick_members')) return true;
      const customRole = this.serverRoles.find((sr: any) => sr.name === r);
      if (customRole && (customRole.permissions ?? []).includes('kick_members')) return true;
    }
    return false;
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

  confirmBan(member: GgServerMember): void {
    if (!this.selectedServer) return;
    const name = member.username ?? member.user_id;
    this.showCyberConfirm(
      `Ban ${name} from the server? This will remove them and prevent re-joining.`,
      () => {
        this.chatService.banMember(this.selectedServer!.id, member.user_id).subscribe({
          next: () => {
            this.members = this.members.filter(m => m.user_id !== member.user_id);
            this.cdr.markForCheck();
          },
          error: (err) => this.showCyberAlert(err.error?.message ?? 'Failed to ban member'),
        });
      },
      'Ban',
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
          this.inviteLinkUrl = `${window.location.origin}/invite/${active.code.toUpperCase()}`;
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
        this.inviteLinkUrl = `${window.location.origin}/invite/${invite.code.toUpperCase()}`;
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

  copyInviteCode(): void {
    if (!this.activeInvite?.code) return;
    navigator.clipboard.writeText(this.activeInvite.code).then(() => {
      this.copied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000);
    });
  }

  joinServerViaInvite(): void {
    const code = this.joinCode.trim().toUpperCase();
    if (!code || this.joinLoading) return;
    this.joinLoading = true;
    this.joinError = '';
    this.chatService.joinViaInvite(code).subscribe({
      next: (serverId: number) => {
        this.joinLoading = false;
        this.showJoinServer = false;
        this.joinCode = '';
        // Auto-redirect to the joined server's general channel
        this.pendingServerId = String(serverId);
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
    this.micPermissionError = null;
    this.micDeviceDisconnected = false;
    this.voiceMembers = [];
    this.speakingUsers = new Set();
    this.cdr.markForCheck();
    try {
      // Pre-validate audio devices before attempting to connect
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputDevices = devices.filter(d => d.kind === 'audioinput');
      const outputDevices = devices.filter(d => d.kind === 'audiooutput');

      if (inputDevices.length === 0) {
        this.voiceConnecting = false;
        this.micDeviceDisconnected = true;
        this.micPermissionError = 'No microphone detected. Please connect an audio input device.';
        this.cdr.markForCheck();
        return;
      }

      if (outputDevices.length === 0) {
        this.voiceConnecting = false;
        this.micDeviceDisconnected = true;
        this.micPermissionError = 'No speaker or audio output device detected. Please connect an output device.';
        this.cdr.markForCheck();
        return;
      }

      const currentUserId = this.auth.getCurrentUser()?.id;
      this.voiceMembers = currentUserId ? [{ userId: currentUserId, muted: this.voiceMuted, deafened: this.voiceDeafened }] : [];

      this.rebindVoiceCallbacks();

      const guildId = String((channel as any).server_id ?? this.selectedServer?.id ?? '');
      this.voiceChannelId = String(channel.id);
      this.voiceGuildId = String((channel as any).server_id ?? '');
      this.voiceConnected = true;
      await this.voiceService.joinChannel(guildId, String(channel.id));
      this.wireScreenShare();
      this.voiceConnected = true;
      if (this.voiceMuted) this.voiceService.mute();
      if (this.voiceDeafened) this.voiceService.deafen();
      this.syncLocalVoiceMemberState(this.voiceMuted, this.voiceDeafened);
      this.startDeviceMonitoring();
    } catch (e: any) {
      console.error('Voice join failed:', e);
      this.voiceConnected = false;
      this.voiceChannelId = null;

      if (e?.name === 'NotAllowedError') {
        this.micPermissionError = 'Microphone access was denied. Please allow microphone access in your browser settings and try again.';
        this.micDeviceDisconnected = false;
      } else if (e?.name === 'NotFoundError' || e?.name === 'NotReadableError') {
        this.micPermissionError = 'Could not access your microphone or speaker. Please check your audio devices and try again.';
        this.micDeviceDisconnected = true;
      } else if (e?.message && (e.message.includes('microphone') || e.message.includes('audio'))) {
        this.micPermissionError = e.message;
        this.micDeviceDisconnected = false;
      }
    }
    this.voiceConnecting = false;
    this.cdr.markForCheck();
  }

  private async enumerateAudioDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.audioInputDevices = devices.filter(d => d.kind === 'audioinput');
      this.audioOutputDevices = devices.filter(d => d.kind === 'audiooutput');
      this.checkInputDeviceAvailable();
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Failed to enumerate devices:', e);
    }
  }

  private deviceChangeHandler: (() => void) | null = null;

  private startDeviceMonitoring(): void {
    this.stopDeviceMonitoring();
    this.deviceChangeHandler = () => this.enumerateAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
    this.enumerateAudioDevices();
  }

  private stopDeviceMonitoring(): void {
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
  }

  private checkInputDeviceAvailable(): void {
    if (!this.voiceConnected) return;
    if (this.audioInputDevices.length === 0) {
      this.micDeviceDisconnected = true;
      this.micPermissionError = 'No microphone detected. Please connect an audio input device.';
      this.voiceService.onMicPermissionError?.(this.micPermissionError);
      this.cdr.markForCheck();
      return;
    }
    if (this.selectedInputId && this.selectedInputId !== 'default') {
      const stillAvailable = this.audioInputDevices.some(d => d.deviceId === this.selectedInputId);
      if (!stillAvailable) {
        this.micDeviceDisconnected = true;
        this.micPermissionError = 'Your microphone has been disconnected. Please reconnect it or select a different device.';
        this.voiceService.onMicPermissionError?.(this.micPermissionError);
        this.cdr.markForCheck();
      }
    }
  }

  private rebindVoiceCallbacks(): void {
    this.voiceService.onMemberJoined = (userId, _channelId, muted, deafened) => {
      if (!this.voiceMembers.find(m => m.userId === userId)) {
        this.voiceMembers = [...this.voiceMembers, { userId, muted, deafened }];
        this.cdr.markForCheck();
      }
    };
    this.voiceService.onMemberLeft = (userId) => {
      this.voiceMembers = this.voiceMembers.filter(m => m.userId !== userId);
      this.speakingUsers = new Set([...this.speakingUsers].filter(id => id !== userId));
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
    this.voiceService.onLocalSpeaking = (speaking) => {
      this.localMicActive = speaking;
      const currentUserId = this.auth.getCurrentUser()?.id;
      if (currentUserId) {
        const next = new Set(this.speakingUsers);
        if (speaking) {
          next.add(currentUserId);
        } else {
          next.delete(currentUserId);
        }
        this.speakingUsers = next;
      }
      if (speaking) {
        if (this.mutedWarningTimer) {
          clearTimeout(this.mutedWarningTimer);
          this.mutedWarningTimer = null;
        }
        this.showMutedWarning = true;
        this.triggerMutedFeedback();
      } else {
        if (this.mutedWarningTimer) {
          clearTimeout(this.mutedWarningTimer);
        }
        this.mutedWarningTimer = setTimeout(() => {
          this.showMutedWarning = false;
          this.cdr.detectChanges();
        }, 2500);
      }
      this.cdr.detectChanges();
    };
    this.voiceService.onUserMuted = (userId) => {
      this.voiceMembers = this.voiceMembers.map(m =>
        m.userId === userId ? { ...m, muted: true } : m
      );
      this.cdr.markForCheck();
    };
    this.voiceService.onUserUnmuted = (userId) => {
      this.voiceMembers = this.voiceMembers.map(m =>
        m.userId === userId ? { ...m, muted: false } : m
      );
      this.cdr.markForCheck();
    };
    this.voiceService.onUserDeafened = (userId) => {
      this.voiceMembers = this.voiceMembers.map(m =>
        m.userId === userId ? { ...m, muted: true, deafened: true } : m
      );
      this.cdr.markForCheck();
    };
    this.voiceService.onUserUndeafened = (userId) => {
      this.voiceMembers = this.voiceMembers.map(m =>
        m.userId === userId ? { ...m, muted: false, deafened: false } : m
      );
      this.cdr.markForCheck();
    };
    this.voiceService.onUserSpeaking = (userId) => {
      if (!this.speakingUsers.has(userId)) {
        this.speakingUsers = new Set([...this.speakingUsers, userId]);
        this.cdr.markForCheck();
      }
    };
    this.voiceService.onUserStoppedSpeaking = (userId) => {
      if (this.speakingUsers.has(userId)) {
        this.speakingUsers = new Set([...this.speakingUsers].filter(id => id !== userId));
        this.cdr.markForCheck();
      }
    };
    this.voiceService.onAllVoiceState = (channels) => {
      const currentUserId = this.auth.getCurrentUser()?.id;
      for (const ch of channels) {
        if (ch.channelId === this.voiceChannelId) {
          this.voiceMembers = ch.users.map(u => ({
            userId: u.userId,
            muted: u.muted,
            deafened: u.deafened,
          }));
          const remoteSpeakerIds = ch.users
            .filter(u => u.speaking && u.userId !== currentUserId)
            .map(u => u.userId);
          const localSpeaking = currentUserId && ch.users.some(u => u.userId === currentUserId && u.speaking);
          const merged = new Set(remoteSpeakerIds);
          if (localSpeaking && currentUserId) merged.add(currentUserId);
          else if (currentUserId) merged.delete(currentUserId);
          this.speakingUsers = merged;
          break;
        }
      }
      this.cdr.markForCheck();
    };
    this.voiceService.onUserSoundboardStart = (userId) => {
      this.soundboardUsers = new Set([...this.soundboardUsers, userId]);
      this.cdr.markForCheck();
    };
    this.voiceService.onUserSoundboardStop = (userId) => {
      const next = new Set(this.soundboardUsers);
      next.delete(userId);
      this.soundboardUsers = next;
      this.cdr.markForCheck();
    };
    this.voiceService.onMicPermissionError = (err) => {
      this.stopDeviceMonitoring();
      this.voiceService.leaveChannel();
      this.micPermissionError = err;
      this.voiceConnected = false;
      this.voiceChannelId = null;
      this.voiceMembers = [];
      this.localMicActive = false;
      this.cdr.markForCheck();
    };
    this.voiceService.onDisconnected = () => {
      this.voiceConnected = false;
      this.voiceChannelId = null;
      this.voiceGuildId = null;
      this.voiceMembers = [];
      this.speakingUsers = new Set();
      this.localMicActive = false;
      this.cdr.markForCheck();
    };
  }

  leaveVoice(): void {
    this.stopDeviceMonitoring();
    this.voiceService.onDisconnected = null;
    this.voiceService.leaveChannel();
    this.voiceConnected = false;
    this.voiceChannelId = null;
    this.voiceGuildId = null;
    this.voiceMembers = [];
    this.localMicActive = false;
    this.showMutedWarning = false;
    this.clearMutedFeedback();
    localStorage.removeItem('pendingVoiceReconnect');
    if (this.mutedWarningTimer) {
      clearTimeout(this.mutedWarningTimer);
      this.mutedWarningTimer = null;
    }
    this.micPermissionError = null;
    this.micDeviceDisconnected = false;
    this.voiceService.onMemberJoined = null;
    this.voiceService.onMemberLeft = null;
    this.voiceService.onUserSpeaking = null;
    this.voiceService.onUserStoppedSpeaking = null;
    this.voiceService.onUserMuted = null;
    this.voiceService.onUserUnmuted = null;
    this.voiceService.onUserDeafened = null;
    this.voiceService.onUserUndeafened = null;
    this.voiceService.onExistingMembers = null;
    this.voiceService.onAllVoiceState = null;
    this.voiceService.onMicPermissionError = null;
    this.voiceService.onDisconnected = null;
    this.voiceService.onUserSoundboardStart = null;
    this.voiceService.onUserSoundboardStop = null;
    this.soundboardUsers = new Set();
    this.screenShare.detachRoom();
    this.isScreenSharing = false;
    this.remoteScreenSharer = null;
  }

  private showMutedWarningForDuration(): void {
    this.showMutedWarning = true;
    if (this.mutedWarningTimer) clearTimeout(this.mutedWarningTimer);
    this.mutedWarningTimer = setTimeout(() => {
      this.showMutedWarning = false;
      this.cdr.markForCheck();
    }, 2500);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Screen Share
  // ════════════════════════════════════════════════════════════════════════

  private wireScreenShare(): void {
    const room = this.voiceService.livekitRoom;
    const socket = this.voiceService.voiceSocket;
    if (!room || !socket) return;

    const userId = this.auth.getCurrentUser()?.id ?? '';
    this.screenShare.attachRoom(room, socket, userId, this.screenShareContainer?.nativeElement ?? document.body);

    this.screenShare.remoteShares$.subscribe((share) => {
      this.remoteScreenSharer = {
        userId: share.userId,
        quality: share.quality,
        hasAudio: share.hasAudio,
        element: share.element,
        audioElement: share.audioElement,
      };
      this.cdr.markForCheck();
      setTimeout(() => this.mountRemoteScreenShare(), 0);
    });

    this.screenShare.remoteShareEnded$.subscribe((userId) => {
      if (this.remoteScreenSharer?.userId === userId) {
        this.remoteScreenSharer = null;
        this.cdr.markForCheck();
      }
    });

    this.screenShare.error$.subscribe((msg) => {
      this.screenShareError = msg;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.screenShareError = null;
        this.cdr.markForCheck();
      }, 4000);
    });

    if (this.socket) {
      this.socket.on('user-screen-share-start', (data: { userId: string; quality: ScreenShareQuality; hasAudio: boolean }) => {
        if (data.userId === this.auth.getCurrentUser()?.id) return;
      });
      this.socket.on('user-screen-share-stop', (data: { userId: string }) => {
        if (this.remoteScreenSharer?.userId === data.userId) {
          this.remoteScreenSharer = null;
          this.cdr.markForCheck();
        }
      });
    }
  }

  private mountRemoteScreenShare(): void {
    if (!this.remoteScreenSharer || !this.screenShareContainer) return;
    const host = this.screenShareContainer.nativeElement;
    host.innerHTML = '';
    host.appendChild(this.remoteScreenSharer.element);
    if (this.remoteScreenSharer.audioElement) {
      this.remoteScreenSharer.audioElement.style.display = 'none';
      document.body.appendChild(this.remoteScreenSharer.audioElement);
    }
  }

  openScreenShareConfirm(): void {
    this.screenSharePendingAudio = this.screenShareShareAudio;
    this.showScreenShareQualityMenu = false;
    const msg = this.screenShareShareAudio
      ? `Start streaming at ${this.screenShareQuality}? Others in the channel will see your stream and hear the shared audio.`
      : `Start streaming at ${this.screenShareQuality}? Others in the channel will see your stream. You can stop at any time.`;
    this.showCyberConfirm(msg, () => this.confirmStartScreenShare(), 'START', 'Cancel');
  }

  cancelScreenShare(): void {
    this.cdr.markForCheck();
  }

  toggleScreenShareQualityMenu(): void {
    this.showScreenShareQualityMenu = !this.showScreenShareQualityMenu;
    this.cdr.markForCheck();
  }

  setScreenShareQuality(quality: ScreenShareQuality): void {
    this.screenShareQuality = quality;
    this.screenShare.setQuality(quality);
    this.cdr.markForCheck();
  }

  async confirmStartScreenShare(): Promise<void> {
    const shareAudio = this.screenSharePendingAudio;
    const color = this.theme.customColor() ?? '#00ff88';
    this.screenShare.rememberThemeColor(this.voiceService.getUserThemeColor(this.auth.getCurrentUser()?.id ?? '') || color);
    try {
      await this.screenShare.start({
        quality: this.screenShareQuality,
        shareAudio,
      });
      this.isScreenSharing = this.screenShare.isActivelySharing();
      if (this.isScreenSharing) {
        this.mountSelfScreenShareView();
      }
      this.cdr.markForCheck();
    } catch (e: any) {
      this.screenShareError = e?.message ?? 'Failed to start screen share';
      this.cdr.markForCheck();
    }
  }

  async stopScreenShare(): Promise<void> {
    this.unmountSelfScreenShareView();
    await this.screenShare.stop();
    this.isScreenSharing = false;
    this.cdr.markForCheck();
  }

  private mountSelfScreenShareView(): void {
    const container = this.screenShareSelfView?.nativeElement;
    if (!container) return;
    const stream = this.screenShare.getCurrentStream();
    if (!stream) return;
    container.innerHTML = '';
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.borderRadius = '4px';
    video.style.background = '#000';
    container.appendChild(video);
  }

  private unmountSelfScreenShareView(): void {
    const container = this.screenShareSelfView?.nativeElement;
    if (container) container.innerHTML = '';
  }

  toggleScreenSharePanel(): void {
    this.screenSharePanelCollapsed = !this.screenSharePanelCollapsed;
    this.cdr.markForCheck();
  }

  private triggerMutedFeedback(): void {
    if (Date.now() < this.mutedFeedbackSuppressedUntil) return;
    if (!this.voiceMuted && !this.voiceDeafened) return;
    if (this.isInVoiceView()) return;
    this.mutedFeedbackIsDeafened = this.voiceDeafened;
    const msg = this.voiceDeafened
      ? "YOU'RE DEAFENED — OTHERS CAN'T HEAR YOU"
      : "YOU'RE MUTED — OTHERS CAN'T HEAR YOU";
    this.mutedFeedbackAlert = msg;
    if (this.mutedFeedbackTimer) clearTimeout(this.mutedFeedbackTimer);
    this.mutedFeedbackTimer = setTimeout(() => {
      this.mutedFeedbackAlert = null;
      this.cdr.markForCheck();
    }, 2500);
    this.cdr.markForCheck();
  }

  dismissMutedFeedback(): void {
    if (this.mutedFeedbackTimer) clearTimeout(this.mutedFeedbackTimer);
    this.mutedFeedbackAlert = null;
    this.mutedFeedbackSuppressedUntil = Date.now() + 10 * 60 * 1000;
    this.mutedFeedbackTimer = setTimeout(() => {
      this.mutedFeedbackSuppressedUntil = 0;
      this.triggerMutedFeedback();
    }, 10 * 60 * 1000);
    this.cdr.markForCheck();
  }

  private clearMutedFeedback(): void {
    if (this.mutedFeedbackTimer) clearTimeout(this.mutedFeedbackTimer);
    this.mutedFeedbackAlert = null;
    this.mutedFeedbackIsDeafened = false;
    this.mutedFeedbackSuppressedUntil = 0;
    this.cdr.markForCheck();
  }

  private syncLocalVoiceMemberState(muted: boolean, deafened: boolean): void {
    const currentUserId = this.auth.getCurrentUser()?.id;
    if (!currentUserId) return;
    this.voiceMembers = this.voiceMembers.map(m =>
      m.userId === currentUserId ? { ...m, muted, deafened } : m
    );
  }

  toggleVoiceMute(): void {
    if (this.voiceMuted) {
      this.voiceMuted = false;
      if (this.voiceDeafened) {
        this.voiceDeafened = false;
      }
      if (this.voiceConnected) {
        this.voiceService.unmute();
        if (!this.voiceDeafened) this.voiceService.undeafen();
        this.syncLocalVoiceMemberState(false, this.voiceDeafened);
      }
      this.clearMutedFeedback();
    } else {
      this.voiceMuted = true;
      if (this.voiceConnected) {
        this.voiceService.mute();
        this.syncLocalVoiceMemberState(true, this.voiceDeafened);
      }
      this.showMutedWarningForDuration();
      this.triggerMutedFeedback();
    }
    localStorage.setItem('voiceMuted', String(this.voiceMuted));
    localStorage.setItem('voiceDeafened', String(this.voiceDeafened));
    this.cdr.markForCheck();
  }

  toggleVoiceDeaf(): void {
    if (this.voiceDeafened) {
      this.voiceDeafened = false;
      this.voiceMuted = false;
      if (this.voiceConnected) {
        this.voiceService.undeafen();
        this.syncLocalVoiceMemberState(false, false);
      }
      this.clearMutedFeedback();
    } else {
      this.voiceDeafened = true;
      this.voiceMuted = true;
      if (this.voiceConnected) {
        this.voiceService.deafen();
        this.syncLocalVoiceMemberState(true, true);
      }
      this.showMutedWarningForDuration();
      this.triggerMutedFeedback();
    }
    localStorage.setItem('voiceMuted', String(this.voiceMuted));
    localStorage.setItem('voiceDeafened', String(this.voiceDeafened));
    this.cdr.markForCheck();
  }

  toggleDevicePicker(): void {
    this.showDevicePicker = !this.showDevicePicker;
    this.cdr.markForCheck();
  }

  toggleSoundboard(): void {
    this.showSoundboard = !this.showSoundboard;
    if (this.showSoundboard && this.soundboardSounds.length === 0) {
      this.loadSoundboardSounds();
    }
    this.cdr.markForCheck();
  }

  loadSoundboardSounds(): void {
    if (!this.selectedServer) return;
    this.voiceService.getSoundboardSounds(this.selectedServer.id).subscribe({
      next: (sounds) => { this.soundboardSounds = sounds; this.cdr.markForCheck(); },
      error: () => { this.soundboardSounds = []; },
    });
  }

  playSoundboardSound(url: string, soundName: string): void {
    if (this.soundboardPlaying) return;
    this.soundboardPlaying = true;
    this.voiceService.playSoundboard(url, soundName).finally(() => {
      this.soundboardPlaying = false;
      this.cdr.markForCheck();
    });
  }

  stopSoundboard(): void {
    this.voiceService.stopSoundboard();
    this.soundboardPlaying = false;
    this.cdr.markForCheck();
  }

  uploadSoundboardSound(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.selectedServer) return;
    const file = input.files[0];
    const name = this.newSoundboardName.trim() || file.name.replace(/\.[^.]+$/, '');
    this.soundboardUploading = true;
    this.voiceService.uploadSoundboardSound(this.selectedServer.id, file, name).subscribe({
      next: (sound) => {
        this.soundboardSounds = [...this.soundboardSounds, sound];
        this.newSoundboardName = '';
        this.soundboardUploading = false;
        input.value = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.soundboardUploading = false;
        this.showCyberAlert('Failed to upload sound');
        this.cdr.markForCheck();
      },
    });
  }

  deleteSoundboardSound(id: number): void {
    if (!this.selectedServer) return;
    this.voiceService.deleteSoundboardSound(this.selectedServer.id, id).subscribe({
      next: () => {
        this.soundboardSounds = this.soundboardSounds.filter(s => s.id !== id);
        this.cdr.markForCheck();
      },
      error: () => { this.showCyberAlert('Failed to delete sound'); },
    });
  }

  canManageSoundboard(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const member = this.members.find(m => String(m.user_id) === String(this.currentUser.id));
    if (!member) return false;
    const roles: string[] = member.roles ?? [];
    if (roles.includes('owner')) return true;
    const builtInPerms: Record<string, string[]> = {
      admin: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members', 'manage_soundboard', 'control_voice'],
      moderator: ['manage_messages', 'kick_members', 'manage_soundboard', 'control_voice'],
      member: [],
    };
    for (const r of roles) {
      if ((builtInPerms[r] ?? []).includes('manage_soundboard')) return true;
      const customRole = this.serverRoles.find((sr: any) => sr.name === r);
      if (customRole && (customRole.permissions ?? []).includes('manage_soundboard')) return true;
    }
    return false;
  }

  canControlVoice(): boolean {
    if (!this.selectedServer || !this.currentUser) return false;
    const member = this.members.find(m => String(m.user_id) === String(this.currentUser.id));
    if (!member) return false;
    const roles: string[] = member.roles ?? [];
    if (roles.includes('owner')) return true;
    const builtInPerms: Record<string, string[]> = {
      admin: ['manage_channels', 'manage_messages', 'manage_members', 'kick_members', 'manage_soundboard', 'control_voice'],
      moderator: ['manage_messages', 'kick_members', 'manage_soundboard', 'control_voice'],
      member: [],
    };
    for (const r of roles) {
      if ((builtInPerms[r] ?? []).includes('control_voice')) return true;
      const customRole = this.serverRoles.find((sr: any) => sr.name === r);
      if (customRole && (customRole.permissions ?? []).includes('control_voice')) return true;
    }
    return false;
  }

  dismissMicError(): void {
    this.micPermissionError = null;
    this.micDeviceDisconnected = false;
    if (this.voiceConnected) this.leaveVoice();
    this.cdr.markForCheck();
  }

  async selectInputDevice(deviceId: string): Promise<void> {
    this.selectedInputId = deviceId;
    try {
      const constraints: MediaStreamConstraints = {
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(t => t.stop());
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Failed to select input device:', e);
    }
  }

  selectOutputDevice(deviceId: string): void {
    this.selectedOutputId = deviceId;
    this.cdr.markForCheck();
  }

  /**
   * Toggle the in-line noise gate (free, audio-thread worklet).
   * Sits between the mic source and the mute gain — silences
   * background noise (keyboard, fans) when disabled signal is below the
   * adaptive noise floor.
   */
  toggleNoiseSuppression(enabled: boolean): void {
    this.noiseSuppressionEnabled = enabled;
    this.voiceService.setNoiseSuppression(enabled);
    this.cdr.markForCheck();
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
    this.persistView();
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
        if (!this.dmMessages.some(m => m.id === msg.id)) {
          this.dmMessages = [...this.dmMessages, msg];
        }
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

    this.socket.on('voice-nudge', (data: { fromUserId: string; fromUsername: string }) => {
      this.nudgeService.handleIncomingNudge(data.fromUserId, data.fromUsername);
    });

    this.socket.on('voice-invite-received', (data: { fromUserId: string; fromUsername: string; fromAvatar: string | null; guildId: string; channelId: string }) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const notif = new Notification(`${data.fromUsername} invited you to voice`, {
        body: 'Click to join',
        icon: data.fromAvatar ?? undefined,
        tag: `voice-invite-${data.fromUserId}`,
        requireInteraction: true,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
        this.voiceService.joinChannel(data.guildId, data.channelId);
      };
    });

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
      const isInView = this.viewMode === 'server' && this.selectedChannel && msg.channel_id === String(this.selectedChannel.id);
      if (isInView) {
        if (!this.messages.some(m => m.id === msg.id)) {
          this.messages = [...this.messages, msg];
        }
        this.cdr.markForCheck();
        this.scrollToBottom(true);
      } else if (String(msg.user_id) !== String(this.currentUser?.id)) {
        this.soundService.play('notification_msg');
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = msg.guild_name ? `#${msg.channel_name} — ${msg.guild_name}` : `#${msg.channel_name}`;
          const notif = new Notification(title, {
            body: `${msg.username}: ${msg.content}`,
            icon: msg.avatar_url ?? undefined,
            tag: `msg-${msg.channel_id}`,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
            const ch = this.channels.find(c => String(c.id) === msg.channel_id);
            if (ch) {
              const srv = this.servers.find(s => s.id === ch.server_id);
              if (srv) this.selectServer(srv);
              setTimeout(() => this.selectChannel(ch), 100);
            }
          };
        }
      }
    });

    this.socket.on('dm-message', (msg: ChatMessage) => {
      const convId = msg.channel_id?.startsWith('dm_') ? Number(msg.channel_id.replace('dm_', '')) : null;
      const isInView = this.viewMode === 'dm' && this.selectedDm && convId === this.selectedDm.id;
      if (isInView) {
        if (!this.dmMessages.some(m => m.id === msg.id)) {
          this.dmMessages = [...this.dmMessages, msg];
        }
        this.cdr.markForCheck();
        this.scrollToBottom(true);
      } else if (String(msg.user_id) !== String(this.currentUser?.id)) {
        this.soundService.play('notification_msg');
        if ('Notification' in window && Notification.permission === 'granted') {
          const notif = new Notification(`${msg.username}`, {
            body: msg.content,
            icon: msg.avatar_url ?? undefined,
            tag: `dm-${convId}`,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
            const conv = this.dmConversations.find(c => c.id === convId);
            if (conv) this.selectDm(conv);
          };
        }
      }
      const conv = this.dmConversations.find(c => c.id === convId);
      if (conv) {
        conv.lastMessage = msg.content;
        conv.lastMessageAt = msg.created_at;
      }
    });

    this.socket.on('message-deleted', (payload: { messageId: number; channelId: string }) => {
      const { messageId, channelId } = payload;
      if (this.viewMode === 'server' && this.selectedChannel && channelId === String(this.selectedChannel.id)) {
        this.messages = this.messages.filter(m => m.id !== messageId);
        this.cdr.markForCheck();
      }
      if (this.viewMode === 'dm' && this.selectedDm && channelId === `dm_${this.selectedDm.id}`) {
        this.dmMessages = this.dmMessages.filter(m => m.id !== messageId);
        this.cdr.markForCheck();
      }
    });

    this.socket.on('messages-cleared', (payload: { channelId: number; count: number }) => {
      if (this.viewMode === 'server' && this.selectedChannel && payload.channelId === this.selectedChannel.id) {
        this.loadMessages(this.selectedChannel.id);
      }
    });

    this.socket.on('typing-start', (payload: { userId: string; username: string; channelId: string }) => {
      if (!this.selectedChannel || payload.channelId !== String(this.selectedChannel.id)) return;
      if (payload.userId === this.currentUser?.id) return;
      if (this.typingUsers.has(payload.userId)) {
        clearTimeout(this.typingUsers.get(payload.userId)!.timer);
      }
      const timer = setTimeout(() => {
        this.typingUsers.delete(payload.userId);
        this.cdr.markForCheck();
      }, 3000);
      this.typingUsers.set(payload.userId, { username: payload.username, timer });
      this.cdr.markForCheck();
    });

    this.socket.on('typing-stop', (payload: { userId: string; channelId: string }) => {
      if (!this.selectedChannel || payload.channelId !== String(this.selectedChannel.id)) return;
      if (this.typingUsers.has(payload.userId)) {
        clearTimeout(this.typingUsers.get(payload.userId)!.timer);
        this.typingUsers.delete(payload.userId);
        this.cdr.markForCheck();
      }
    });

    this.socket.on('friend-request', () => {
      this.loadFriends();
    });

    this.socket.on('friend-accepted', () => {
      this.loadFriends();
      this.loadDmConversations();
    });

    this.socket.on('notification', (data: AppNotification) => {
      this.soundService.play('notification_msg');
      if (data?.id) {
        const exists = this.notifications.some(n => n.id === data.id);
        if (!exists) {
          this.notifications = [data, ...this.notifications];
          this.unreadCount = this.notifications.filter(x => !x.read).length;
          this.cdr.markForCheck();
        }
      } else {
        this.loadNotifications();
      }
    });

    this.socket.on('notification-deleted', (data: { id: number }) => {
      if (data?.id) {
        this.notifications = this.notifications.filter(n => n.id !== data.id);
        this.unreadCount = this.notifications.filter(x => !x.read).length;
        this.cdr.markForCheck();
      }
    });

    this.socket.on('notifications-cleared', () => {
      this.notifications = [];
      this.unreadCount = 0;
      this.cdr.markForCheck();
    });

    this.socket.on('server-created', (server: any) => {
      if (server && !this.servers.find(s => s.id === server.id)) {
        this.servers = [...this.servers, server];
        if (this.showCreateServer) {
          this.selectServer(server);
        }
        this.cdr.markForCheck();
      }
    });

    this.socket.on('server-updated', (server: any) => {
      if (!server?.id) return;
      const idx = this.servers.findIndex(s => s.id === server.id);
      if (idx >= 0) {
        this.servers = this.servers.map((s, i) => i === idx ? { ...s, ...server } : s);
        if (this.selectedServer?.id === server.id) {
          this.selectedServer = { ...this.selectedServer, ...server };
        }
        this.cdr.markForCheck();
      }
    });

    this.socket.on('server-deleted', (payload: any) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      this.servers = this.servers.filter(s => s.id !== serverId);
      if (this.selectedServer?.id === serverId) {
        this.selectedServer = null;
        this.selectedChannel = null;
        this.viewMode = 'dm';
      }
      this.cdr.markForCheck();
    });

    this.socket.on('channel-created', (channel: any) => {
      if (!channel?.id || !this.selectedServer || channel.server_id !== this.selectedServer.id) return;
      if (!this.channels.find(c => c.id === channel.id)) {
        this.channels = [...this.channels, channel];
        if (this.showCreateChannel) {
          this.selectChannel(channel);
        }
        this.cdr.markForCheck();
      }
    });

    this.socket.on('channel-deleted', (payload: any) => {
      const channelId = payload?.channelId;
      const serverId = payload?.serverId;
      if (!channelId) return;
      if (this.selectedServer && serverId === this.selectedServer.id) {
        this.channels = this.channels.filter(c => c.id !== channelId);
        if (this.selectedChannel?.id === channelId) {
          this.selectedChannel = this.channels[0] ?? null;
        }
        this.cdr.markForCheck();
      }
    });

    this.socket.on('channel-roles-updated', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      this.loadChannels(this.selectedServer.id);
    });

    this.socket.on('channel-category-updated', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      this.loadChannels(this.selectedServer.id);
    });

    this.socket.on('member-joined', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      if (payload?.userId && !this.members.find(m => String(m.user_id) === String(payload.userId))) {
        this.members = [...this.members, {
          user_id: payload.userId,
          server_id: payload.serverId,
          roles: payload.roles ?? ['member'],
          username: payload.username ?? 'Unknown',
          avatar_url: payload.avatar_url ?? null,
          status: 'online',
          joined_at: new Date().toISOString(),
        }];
        if (payload.userId && payload.username) {
          this.memberStatuses = { ...this.memberStatuses, [String(payload.userId)]: 'online' };
        }
        this.cdr.markForCheck();
      }
    });

    this.socket.on('member-left', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      if (payload?.userId) {
        this.members = this.members.filter(m => String(m.user_id) !== String(payload.userId));
        this.cdr.markForCheck();
      }
    });

    this.socket.on('member-roles-updated', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      if (payload?.userId && payload?.roles) {
        this.members = this.members.map(m =>
          String(m.user_id) === String(payload.userId) ? { ...m, roles: payload.roles } : m
        );
        this.cdr.markForCheck();
      }
    });

    this.socket.on('member-kicked', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      if (payload?.userId) {
        this.members = this.members.filter(m => String(m.user_id) !== String(payload.userId));
        this.cdr.markForCheck();
      }
    });

    this.socket.on('member-banned', (payload: any) => {
      if (!this.selectedServer || payload?.serverId !== this.selectedServer.id) return;
      if (payload?.userId) {
        this.members = this.members.filter(m => String(m.user_id) !== String(payload.userId));
        this.cdr.markForCheck();
      }
    });

    this.socket.on('kicked-from-server', (payload: any) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      this.servers = this.servers.filter(s => s.id !== serverId);
      if (this.selectedServer?.id === serverId) {
        this.selectedServer = null;
        this.selectedChannel = null;
        this.viewMode = 'dm';
      }
      this.cdr.markForCheck();
    });

    this.socket.on('banned-from-server', (payload: any) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      this.servers = this.servers.filter(s => s.id !== serverId);
      if (this.selectedServer?.id === serverId) {
        this.selectedServer = null;
        this.selectedChannel = null;
        this.viewMode = 'dm';
      }
      this.cdr.markForCheck();
    });

    this.socket.on('friend-removed', () => {
      this.loadFriends();
    });

    this.socket.on('friend-request-rejected', () => {
      this.loadFriends();
    });

    this.socket.on('friend-request-cancelled', () => {
      this.loadFriends();
    });

    this.socket.on('friend-request-sent', () => {
      this.loadFriends();
    });

    this.socket.on('all-voice-state', (data: { channels: { channelId: string; users: { userId: string; muted: boolean; deafened: boolean; speaking: boolean }[] }[] }) => {
      this.allVoiceChannels = data.channels;
      if (this.voiceConnected && this.voiceChannelId) {
        const myChannel = data.channels.find(c => c.channelId === this.voiceChannelId);
        if (myChannel) {
          this.voiceMembers = myChannel.users.map(u => ({ userId: u.userId, muted: u.muted, deafened: u.deafened }));
          const speaking = new Set<string>();
          for (const u of myChannel.users) {
            if (u.speaking) speaking.add(u.userId);
          }
          this.speakingUsers = speaking;
        }
      }
      this.cdr.markForCheck();
    });

    this.socket.on('dm-conversation-created', () => {
      this.loadDmConversations();
    });

    this.socket.on('dm-conversation-updated', (payload: any) => {
      const convId = payload?.conversationId;
      if (!convId) return;
      const conv = this.dmConversations.find(c => c.id === convId);
      if (conv) {
        conv.lastMessage = payload.lastMessage ?? conv.lastMessage;
        conv.lastMessageAt = payload.lastMessageAt ?? conv.lastMessageAt;
        this.dmConversations = [...this.dmConversations];
        this.cdr.markForCheck();
      } else {
        this.loadDmConversations();
      }
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

    if (this.voiceContextMenu) {
      const target = event.target as HTMLElement;
      if (!target.closest('.cyber-context-menu')) {
        this.closeVoiceContextMenu();
      }
    }

    if (this.memberPanelContextMenu) {
      const target = event.target as HTMLElement;
      if (!target.closest('.cyber-context-menu')) {
        this.closeMemberPanelContextMenu();
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

    if (this.showDevicePicker) {
      const target = event.target as HTMLElement;
      if (!target.closest('.gg-voice-device-picker') && !target.closest('.gg-voice-control-btn')) {
        this.showDevicePicker = false;
        this.cdr.markForCheck();
      }
    }

    if (this.micPermissionError) {
      const target = event.target as HTMLElement;
      if (!target.closest('.gg-voice-mic-error')) {
        this.dismissMicError();
      }
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.showGifPicker) { this.showGifPicker = false; this.cdr.markForCheck(); }
    if (this.confirmData) { this.cancelConfirm(); this.cdr.markForCheck(); }
    if (this.contextMenu) { this.closeContextMenu(); this.cdr.markForCheck(); }
    if (this.voiceContextMenu) { this.closeVoiceContextMenu(); this.cdr.markForCheck(); }
    if (this.emojiPickerMsg) { this.closeEmojiPicker(); this.cdr.markForCheck(); }
    if (this.serverDropdownOpen) { this.closeServerDropdown(); this.cdr.markForCheck(); }
    // ... rest of the existing escape handlers ...
    if (this.showServerSettings) { this.showServerSettings = false; this.cdr.markForCheck(); }
    if (this.showCreateServer) { this.showCreateServer = false; this.cdr.markForCheck(); }
    if (this.showCreateChannel) { this.showCreateChannel = false; this.cdr.markForCheck(); }
    if (this.showFriendsList) { this.showFriendsList = false; this.cdr.markForCheck(); }
    if (this.showAddFriend) { this.showAddFriend = false; this.cdr.markForCheck(); }
    if (this.showInviteLinks) { this.closeInviteLinks(); this.cdr.markForCheck(); }
    if (this.showJoinServer) { this.showJoinServer = false; this.cdr.markForCheck(); }
    if (this.showDevicePicker) { this.showDevicePicker = false; this.cdr.markForCheck(); }
    if (this.micPermissionError) { this.dismissMicError(); }
    if (this.mutedFeedbackAlert) { this.dismissMutedFeedback(); }
  }

  @HostListener('window:blur')
  handleWindowBlur(): void {
    if (this.contextMenu) {
      this.closeContextMenu();
      this.cdr.markForCheck();
    }
    if (this.voiceContextMenu) {
      this.closeVoiceContextMenu();
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
    if (member) {
      const cached = this.serverProfileCache.get(String(member.user_id));
      if (cached?.avatar_url) return this.fixSupabaseUrl(cached.avatar_url) ?? '';
    }
    return this.fixSupabaseUrl(member?.avatar_url) ?? '';
  }

  serverAvatar(server: GgServer): string {
    return this.fixSupabaseUrl(server.avatar_url) ?? '';
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
    if (!this.selectedDm) return;
    const peerId = this.selectedDm.otherUserId;
    const peerName = this.selectedDm.otherUsername;
    const outgoing = this.callService.currentOutgoingCall;
    const active = this.callService.currentActiveCall;
    const targetId = outgoing?.callId || active?.callId;
    if (targetId) {
      this.callService.end(targetId);
    } else {
      this.callService.initiate(peerId, peerName);
    }
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
      error: (err) => this.showFooterInfo(err.error?.message ?? 'Failed to delete message'),
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

  copyMessageText(msg: ChatMessage): void {
    navigator.clipboard.writeText(msg.content).catch(() => {});
  }

  openVoiceContextMenu(event: MouseEvent, vm: any): void {
    event.preventDefault();
    event.stopPropagation();
    this.voiceContextMenu = { x: event.clientX, y: event.clientY, vm };
    this.cdr.markForCheck();
  }

  closeVoiceContextMenu(): void {
    this.voiceContextMenu = null;
  }

  onVoiceContextNudge(vm: any): void {
    this.nudgeService.sendNudge(vm.userId, vm.username ?? '');
    this.closeVoiceContextMenu();
    this.cdr.markForCheck();
  }

  onVoiceContextCall(vm: any): void {
    this.callService.initiate(vm.userId, vm.username ?? '');
    this.closeVoiceContextMenu();
  }

  onMemberContextMenu(event: { event: MouseEvent; member: any }): void {
    if (this.viewMode !== 'server') return;
    const menuWidth = 220;
    const x = event.event.clientX - menuWidth - 8;
    const y = event.event.clientY;
    this.memberPanelContextMenu = { x, y, member: event.member };
    this.cdr.markForCheck();
  }

  closeMemberPanelContextMenu(): void {
    this.memberPanelContextMenu = null;
  }

  isMemberInVoice(userId: string): boolean {
    return this.voiceMembers.some(m => m.userId === userId);
  }

  disconnectMemberFromVoice(userId: string): void {
    if (!this.selectedServer) return;
    this.chatService.kickMember(this.selectedServer.id, userId).subscribe({
      error: () => { this.showCyberAlert('Failed to disconnect member'); },
    });
  }

  onMemberCtxNudge(): void {
    if (!this.memberPanelContextMenu) return;
    const m = this.memberPanelContextMenu.member;
    this.nudgeService.sendNudge(m.user_id, m.username ?? '');
    this.closeMemberPanelContextMenu();
    this.cdr.markForCheck();
  }

  onMemberCtxCall(): void {
    if (!this.memberPanelContextMenu) return;
    const m = this.memberPanelContextMenu.member;
    this.callService.initiate(String(m.user_id), m.username ?? '');
    this.closeMemberPanelContextMenu();
  }

  onMemberCtxInviteToVoice(): void {
    if (!this.memberPanelContextMenu) return;
    const m = this.memberPanelContextMenu.member;
    this.voiceService.sendVoiceInvite(String(m.user_id));
    this.closeMemberPanelContextMenu();
  }

  onMemberCtxMute(): void {
    if (!this.memberPanelContextMenu) return;
    const userId = this.memberPanelContextMenu.member.user_id;
    const wasMuted = this.voiceService.isLocalMuted(userId);
    this.voiceService.setLocalMute(userId, !wasMuted);
    if (!wasMuted) {
      this.voiceService.setLocalDeafen(userId, false);
    }
    this.closeMemberPanelContextMenu();
    this.cdr.markForCheck();
  }

  onMemberCtxDeafen(): void {
    if (!this.memberPanelContextMenu) return;
    const userId = this.memberPanelContextMenu.member.user_id;
    const wasDeafened = this.voiceService.isLocalDeafened(userId);
    this.voiceService.setLocalDeafen(userId, !wasDeafened);
    this.closeMemberPanelContextMenu();
    this.cdr.markForCheck();
  }

  onVoiceContextMute(vm: any): void {
    const userId = vm.userId;
    if (userId !== this.currentUser?.id && !this.canControlVoice()) {
      this.closeVoiceContextMenu();
      return;
    }
    const wasMuted = this.voiceService.isLocalMuted(userId);
    this.voiceService.setLocalMute(userId, !wasMuted);
    if (!wasMuted) {
      this.voiceService.setLocalDeafen(userId, false);
    }
    this.closeVoiceContextMenu();
    this.cdr.markForCheck();
  }

  onVoiceContextDeafen(vm: any): void {
    const userId = vm.userId;
    if (userId !== this.currentUser?.id && !this.canControlVoice()) {
      this.closeVoiceContextMenu();
      return;
    }
    const wasDeafened = this.voiceService.isLocalDeafened(userId);
    this.voiceService.setLocalDeafen(userId, !wasDeafened);
    this.closeVoiceContextMenu();
    this.cdr.markForCheck();
  }

  isSoundboardMutedFor(userId: string): boolean {
    return this.voiceService.isSoundboardMutedFor(userId);
  }

  onToggleSoundboardMute(userId: string): void {
    const isMuted = this.voiceService.isSoundboardMutedFor(userId);
    this.voiceService.setSoundboardMuted(userId, !isMuted);
    if (isMuted) {
      this.voiceService.applySoundboardMuteForUser(userId);
    } else {
      this.voiceService.unapplySoundboardMuteForUser(userId);
    }
    this.cdr.markForCheck();
  }

  isNudged(userId: string): boolean {
    return this.nudgeService.isRecentlyNudged(userId);
  }

  getUserVolume(userId: string): number {
    return this.voiceService.getUserVolume(userId);
  }

  getUserThemeColor(userId: string): string {
    return this.voiceService.getUserThemeColor(userId);
  }

  onUserVolumeChange(userId: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.voiceService.setUserVolume(userId, val);
    this.cdr.markForCheck();
  }

  resetUserVolume(userId: string): void {
    this.voiceService.resetUserVolume(userId);
    this.cdr.markForCheck();
  }

  setUserVolume(userId: string, volume: number): void {
    this.voiceService.setUserVolume(userId, volume);
    this.cdr.markForCheck();
  }

  kickMemberFromVoice(userId: string): void {
    if (!this.selectedServer || !this.selectedChannel) return;
    this.chatService.kickMember(this.selectedServer.id, userId).subscribe({
      error: () => { this.showCyberAlert('Failed to kick member'); },
    });
  }

  kickMemberFromMsg(msg: ChatMessage): void {
    if (!this.selectedServer || !msg.user_id) return;
    this.chatService.kickMember(this.selectedServer.id, msg.user_id.toString()).subscribe({
      error: () => { this.showCyberAlert('Failed to kick member'); },
    });
  }

  banMemberFromMsg(msg: ChatMessage): void {
    if (!this.selectedServer || !msg.user_id) return;
    this.chatService.banMember(this.selectedServer.id, msg.user_id.toString()).subscribe({
      error: () => { this.showCyberAlert('Failed to ban member'); },
    });
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
    const g = this.currentUser?.gender?.toLowerCase();
    if (g === 'male') return '/assets/avatars/male.webp';
    if (g === 'female') return '/assets/avatars/female.webp';
    return '/assets/avatars/unknown.webp';
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) img.src = this.defaultAvatar();
  }

  fixSupabaseUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.includes('qpdpzookcfrylxnrqkwo.supabase.co')) {
      return url.replace('qpdpzookcfrylxnrqkwo.supabase.co', 'lgesluubuaikmaigwwxq.supabase.co');
    }
    return url;
  }

  @ViewChild('memberHoverCard') hoverCard!: MemberHoverCardComponent;

  hoverCardAvatar: string | null = null;
  hoverCardBanner: string | null = null;
  hoverCardStatus = 'offline';
  hoverCardIsFriend = false;
  hoverCardIsSelf = false;
  hoverCardLoading = false;

  onMsgAvatarHover(event: MouseEvent, msg: ChatMessage): void {
    this.hoverCardIsSelf = msg.user_id != null && String(msg.user_id) === String(this.currentUser?.id);
    this.hoverCardIsFriend = msg.user_id != null && this.friends.some(f => f.other_id === String(msg.user_id));
    this.hoverCardStatus = this.memberStatus(String(msg.user_id ?? ''));
    this.hoverCardAvatar = this.avatarForUsername(msg.username) || msg.avatar_url || null;
    this.hoverCardBanner = null;
    this.hoverCardLoading = true;
    this.hoverCard?.show(event, msg);
    if (this.selectedServer && msg.user_id) {
      const uid = String(msg.user_id);
      this.chatService.getServerProfile(this.selectedServer.id, uid).subscribe({
        next: (p) => {
          if (p) {
            this.hoverCardAvatar = p.avatar_url || this.hoverCardAvatar;
            this.hoverCardBanner = p.banner_url || null;
          }
          if (!this.hoverCardBanner) {
            this.chatService.getUserById(uid).subscribe({
              next: (u) => {
                this.hoverCardBanner = u?.banner_url || null;
                this.hoverCardLoading = false;
                this.cdr.markForCheck();
              },
              error: () => { this.hoverCardLoading = false; this.cdr.markForCheck(); },
            });
          } else {
            this.hoverCardLoading = false;
            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.chatService.getUserById(uid).subscribe({
            next: (u) => {
              this.hoverCardBanner = u?.banner_url || null;
              this.hoverCardLoading = false;
              this.cdr.markForCheck();
            },
            error: () => { this.hoverCardLoading = false; this.cdr.markForCheck(); },
          });
        },
      });
    } else {
      this.hoverCardLoading = false;
    }
    this.cdr.markForCheck();
  }

  onMsgAvatarLeave(): void {
    this.hoverCard?.hide();
  }

  onListMemberHover(event: { event: MouseEvent; member: GgServerMember }): void {
    const m = event.member;
    this.hoverCardIsSelf = this.isSelf(m);
    this.hoverCardIsFriend = this.friends.some(f => f.other_id === String(m.user_id));
    this.hoverCardStatus = this.memberStatus(m.user_id);
    this.hoverCardAvatar = this.resolveAvatar(m, 'avatar_url');
    this.hoverCardBanner = null;
    this.hoverCardLoading = true;
    this.hoverCard?.show(event.event, m, 'panel');
    if (this.selectedServer) {
      const uid = String(m.user_id);
      this.chatService.getServerProfile(this.selectedServer.id, uid).subscribe({
        next: (p) => {
          if (p) {
            this.hoverCardAvatar = p.avatar_url || this.hoverCardAvatar;
            this.hoverCardBanner = p.banner_url || null;
          }
          if (!this.hoverCardBanner) {
            this.chatService.getUserById(uid).subscribe({
              next: (u) => {
                this.hoverCardBanner = u?.banner_url || null;
                this.hoverCardLoading = false;
                this.cdr.markForCheck();
              },
              error: () => { this.hoverCardLoading = false; this.cdr.markForCheck(); },
            });
          } else {
            this.hoverCardLoading = false;
            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.chatService.getUserById(uid).subscribe({
            next: (u) => {
              this.hoverCardBanner = u?.banner_url || null;
              this.hoverCardLoading = false;
              this.cdr.markForCheck();
            },
            error: () => { this.hoverCardLoading = false; this.cdr.markForCheck(); },
          });
        },
      });
    } else {
      this.hoverCardLoading = false;
    }
    this.cdr.markForCheck();
  }

  onListMemberLeave(): void {
    this.hoverCard?.hide();
  }

  onHoverCardAddFriend(member: any): void {
    const username = member?.username;
    if (!username) return;
    this.chatService.sendFriendRequest(username).subscribe({
      next: () => { this.showCyberAlert('Friend request sent!'); this.loadFriends(); },
      error: () => { this.showCyberAlert('Failed to send friend request'); },
    });
    this.hoverCard?.hide();
  }

  onHoverCardOpenProfile(member: any): void {
    this.openProfile({ id: member.user_id, username: member.username, avatar_url: member.avatar_url }, this.selectedServer?.id ?? undefined);
    this.hoverCard?.hide();
  }

  onHoverCardOpenTrade(member: any): void {
    this.openInlineTrading(String(member.user_id), member.username ?? '', member.avatar_url);
    this.hoverCard?.hide();
  }

  onHoverCardOpenGift(member: any): void {
    this.openInlineGift(String(member.user_id), member.username ?? '', member.avatar_url);
    this.hoverCard?.hide();
  }

  onHoverCardOpenCall(member: any): void {
    const peerId = String(member.user_id);
    const peerName = member.username ?? '';
    this.callService.initiate(peerId, peerName);
    this.hoverCard?.hide();
  }

  onHoverCardInviteToVoice(member: any): void {
    const peerId = String(member.user_id);
    this.voiceService.sendVoiceInvite(peerId);
    this.hoverCard?.hide();
  }

  resolveAvatar(user: any, ...keys: string[]): string {
    if (!user) return this.defaultAvatar();
    const userId = String(user.user_id ?? user.id ?? '');
    const cached = this.serverProfileCache.get(userId);
    if (cached?.avatar_url) return this.fixSupabaseUrl(cached.avatar_url) || this.defaultAvatar();
    for (const key of keys) {
      if (user[key]) return this.fixSupabaseUrl(user[key]) || this.defaultAvatar();
    }
    const gender = user.gender?.toLowerCase();
    if (gender === 'male') return '/assets/avatars/male.webp';
    if (gender === 'female') return '/assets/avatars/female.webp';
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

  voiceMemberSoundboard(userId: string): boolean {
    return this.soundboardUsers.has(userId);
  }

  localMuted(userId: string): boolean {
    return this.voiceService.isLocalMuted(userId);
  }

  localDeafened(userId: string): boolean {
    return this.voiceService.isLocalDeafened(userId);
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
    return `/assets/icons/platforms/${id}.svg`;
  }

  // ===== PROFILE VIEW =====

  openProfile(user: any, serverId?: number): void {
    this.profileUser = user;
    this.profileServerId = serverId ?? null;
    this.profileServerProfile = null;
    this.rankImgLoaded = false;
    this.avatarImgLoaded = false;
    this.profileFavorites = [];
    this.profileFavoritesError = '';
    this.profileFavoritesLoading = false;
    this.profileConnections = [];
    this.viewMode = 'profile';
    this.persistView();
    const userId = String(user?.otherUserId ?? user?.id ?? '');
    if (userId) {
      // When in a server context, load the server-scoped profile first
      if (serverId) {
        this.chatService.getServerProfile(serverId, userId).subscribe({
          next: (sp) => {
            this.profileServerProfile = sp;
            // Apply server-scoped about only if explicitly set; otherwise keep main profile value
            if (sp?.show_about === false) {
              this.profileUser = { ...this.profileUser, about: null };
            } else if (sp?.about) {
              this.profileUser = { ...this.profileUser, about: sp.about };
            }
            // Server-scoped avatar/banner override only if set; otherwise fall back to main profile
            if (sp?.avatar_url) {
              this.profileUser = { ...this.profileUser, avatar_url: sp.avatar_url };
            }
            if (sp?.banner_url) {
              this.profileUser = { ...this.profileUser, banner_url: sp.banner_url };
            }
            // Filter rank based on show_rank
            if (sp?.show_rank === false) {
              this.profileUser = { ...this.profileUser, rank: null };
            }
            this.cdr.markForCheck();
          },
          error: () => { this.profileServerProfile = null; },
        });
      }

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
          // Filter connections based on server-scoped visibility
          let allConns = conns ?? [];
          const sp = this.profileServerProfile;
          if (sp && sp.show_connections === false) {
            allConns = [];
          } else if (sp && sp.show_connection_platforms) {
            const platformMap: Record<string, boolean> = sp.show_connection_platforms;
            allConns = allConns.filter(c => platformMap[c.platform] !== false);
          }
          this.profileConnections = allConns;
          this.profileAccounts = allConns.filter(c => (c.type || 'accounts') === 'accounts');
          this.profileMusic = allConns.filter(c => (c.type || '') === 'music');
          this.cdr.markForCheck();
        },
        error: () => { this.profileConnections = []; this.profileAccounts = []; this.profileMusic = []; },
      });

      // Only load favorites if server-scoped show_favorites is not false
      const sp = this.profileServerProfile;
      if (!sp || sp.show_favorites !== false) {
        this.loadProfileFavorites(userId);
      }
    }
  }

  closeProfile(): void {
    this.profileUser = null;
    this.profileServerId = null;
    this.profileServerProfile = null;
    this.profileFavorites = [];
    this.profileFavoritesError = '';
    this.profileFavoritesLoading = false;
    this.profileConnections = [];
    this.viewMode = this.selectedServer ? 'server' : 'dm';
  }

  isOwnProfile(): boolean {
    const currentUserId = this.auth.getCurrentUser()?.id;
    const profileId = this.profileUser?.id ?? this.profileUser?.otherUserId;
    return currentUserId != null && String(currentUserId) === String(profileId);
  }

  openServerSettingsFromProfile(): void {
    if (!this.profileServerId) return;
    this.serverProfileEditorOpen = true;
    this.cdr.markForCheck();
  }

  closeServerProfileEditor(): void {
    this.serverProfileEditorOpen = false;
    this.cdr.markForCheck();
  }

  private loadProfileFavorites(userId: string): void {
    this.profileFavoritesLoading = true;
    this.chatService.getUserShowcase(userId).subscribe({
      next: (res) => {
        const cards = res?.items ?? [];
        this.profileFavorites = cards.slice(0, 10);
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

  rankProgressPercent(): number {
    const rank = this.profileUser?.rank;
    if (!rank || rank.xp_to_next == null) return 0;
    const total = Number(rank.total_xp) || 0;
    const next = Number(rank.xp_to_next) || 0;
    if (next <= 0) return 100;
    return Math.min(100, Math.max(0, (total / next) * 100));
  }

  handleFriendsDm(userId: string | any): void {
    this.closeProfile();
    this.startDmWithUser(typeof userId === 'string' ? userId : String(userId));
  }

  onUsernameClick(username: string): void {
    if (!username || username === 'System') return;
    if (username === this.currentUser?.username) return;
    this.usersService.getUserDetails(undefined, username).subscribe({
      next: (user) => {
        if (user) {
          this.openProfile({ otherUserId: user.id, otherUsername: user.username, username: user.username, id: user.id });
        }
      },
      error: () => {},
    });
  }

  openTradingViewWithUser(userId: string, username?: string, avatar?: string | null): void {
    this.tradeFilterUserId = userId;
    this.tradeFilterUsername = username ?? '';
    this.tradeFilterAvatar = avatar ?? null;
    this.viewMode = 'trading';
    this.persistView();
    this.loadCardTrades();
  }

  openTradingViewWithTrade(tradeId: number, otherUserId: string, otherUsername: string, otherAvatar: string | null): void {
    this.tradeFilterUserId = otherUserId;
    this.tradeFilterUsername = otherUsername;
    this.tradeFilterAvatar = otherAvatar;
    this.focusTradeId = tradeId;
    this.viewMode = 'trading';
    this.selectedServer = null;
    this.selectedChannel = null;
    this.selectedDm = null;
    this.messages = [];
    this.dmMessages = [];
    this.dmOptionsOpen = false;
    this.serverDropdownOpen = false;
    this.persistView();
    this.loadCardTrades();
  }

  openInlineTrading(userId: string, username: string, avatar: string | null = null): void {
    this.tradeFilterUserId = userId;
    this.tradeFilterUsername = username;
    this.tradeFilterAvatar = avatar;
    this.viewMode = 'trading-inline';
    this.persistView();
  }

  openInlineGift(userId: string, username: string, avatar: string | null = null): void {
    this.tradeFilterUserId = userId;
    this.tradeFilterUsername = username;
    this.tradeFilterAvatar = avatar;
    this.viewMode = 'gift-inline';
    this.persistView();
  }

  closeInlineTrade(): void {
    this.tradeFilterUserId = '';
    this.tradeFilterUsername = '';
    this.tradeFilterAvatar = null;
    this.viewMode = this.selectedDm ? 'dm' : (this.selectedServer ? 'server' : 'dm');
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

  cardTrades: any[] = [];

  onTradeAccepted(tradeId: number): void {
    this.loadCardTrades();
  }

  onTradeRejected(tradeId: number): void {
    this.loadCardTrades();
  }

  onTradeCancelled(tradeId: number): void {
    this.loadCardTrades();
  }

  loadCardTrades(): void {
    this.chatService.getCardTrades().subscribe({
      next: (trades) => { this.cardTrades = trades; this.cdr.markForCheck(); },
    });
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
  }
}