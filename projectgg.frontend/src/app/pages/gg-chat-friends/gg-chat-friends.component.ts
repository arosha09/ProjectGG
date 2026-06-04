import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, ActivatedRoute } from '@angular/router';
import {
  ChatService, FriendUser, FriendsData,
} from '../../services/chat.service';
import { StatusMessageComponent, StatusType } from '../../components/status-message/status-message.component';

@Component({
  selector: 'app-gg-chat-friends',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, StatusMessageComponent],
  templateUrl: './gg-chat-friends.component.html',
  styleUrl: './gg-chat-friends.component.scss',
})
export class GgChatFriendsComponent implements OnInit {
  @Input() standalone = true;
  @Input() tab: 'all' | 'pending' | 'add' | 'blocked' = 'all';
  @Input() memberStatuses: Record<string, string> = {};
  @Input() blockedUsers: FriendUser[] = [];
  @Input() set standaloneView(value: boolean) {
    this.standalone = value;
  }
  @Output() startDm = new EventEmitter<string>();

  friends: FriendUser[] = [];
  pendingRequests: FriendUser[] = [];
  sentRequests: FriendUser[] = [];
  loading = true;

  // Add friend
  searchQuery = '';
  searchResults: any[] = [];
  searchingUsers = false;
  sendFriendUsername = '';
  sendingRequest = false;
  friendRequestSuccess = '';
  friendRequestSuccessType: StatusType = 'success';

  constructor(
    private chatService: ChatService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'add') this.tab = 'add';
    });
  }

  ngOnInit(): void {
    this.loadFriends();
    this.initSocketListener();
  }

  private initSocketListener(): void {
    const socket = this.chatService.connect();
    socket.on('profile-update', (data: { userId: string; profile: any }) => {
      this.handleProfileUpdate(data);
    });
    socket.on('friend-request', () => {
      this.loadFriends();
    });
    socket.on('friend-accepted', () => {
      this.loadFriends();
    });
    socket.on('friend-removed', () => {
      this.loadFriends();
    });
    socket.on('friend-request-rejected', () => {
      this.loadFriends();
    });
    socket.on('friend-request-cancelled', () => {
      this.loadFriends();
    });
    socket.on('friend-request-sent', () => {
      this.loadFriends();
    });
  }

  private loadFriends(): void {
    this.loading = true;
    this.chatService.getFriends().subscribe({
      next: (data: FriendsData) => {
        this.friends = data.accepted;
        this.pendingRequests = data.pending;
        this.sentRequests = data.sent;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/gg-chat']);
  }

  onStartDm(friendId: string): void {
    this.startDm.emit(friendId);
  }

  dmFriendStatus(friend: FriendUser): string {
    return this.memberStatuses[friend.other_id] ?? friend.status ?? 'online';
  }

  removeFriend(id: number): void {
    this.chatService.removeFriend(id).subscribe({
      next: () => { this.loadFriends(); },
    });
  }

  acceptRequest(id: number): void {
    this.chatService.acceptFriendRequest(id).subscribe({
      next: () => { this.loadFriends(); },
    });
  }

  // ===== ADD FRIEND =====

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

  sendFriendRequest(username?: string): void {
    const target = username?.trim() || this.sendFriendUsername.trim();
    if (!target) return;
    this.sendingRequest = true;
    this.friendRequestSuccess = '';
    this.chatService.sendFriendRequest(target).subscribe({
      next: () => {
        this.sendFriendUsername = '';
        this.sendingRequest = false;
        this.friendRequestSuccess = `Friend request sent to ${target}!`;
        this.friendRequestSuccessType = 'success';
        this.loadFriends();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.sendingRequest = false;
        this.friendRequestSuccess = err.error?.message ?? 'Failed to send friend request';
        this.friendRequestSuccessType = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  friendStatus(friend: FriendUser): string {
    return this.memberStatuses[friend.other_id] ?? friend.status ?? 'online';
  }

  handleProfileUpdate(data: { userId: string; profile: any }): void {
    const friend = this.friends.find(f => f.other_id === data.userId);
    if (friend) {
      friend.other_username = data.profile.username ?? friend.other_username;
      friend.other_avatar = this.resolveAvatar(data.profile, 'avatar');
      this.cdr.markForCheck();
    }
  }

  resolveAvatar(item: any, ...fields: string[]): string {
    if (!item) return '';
    for (const f of fields) {
      const v = item[f];
      if (v && typeof v === 'string' && v.trim()) return v;
    }
    const gender = item.gender || 'unknown';
    return `/assets/avatars/${gender}.png`;
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.includes('unknown.webp')) {
      img.src = '/assets/avatars/unknown.webp';
    }
  }

  unblockUser(userId: string): void {
    this.chatService.unblockUser(userId).subscribe({
      next: () => {
        // Refresh blocked users by removing the unblocked user
        this.blockedUsers = this.blockedUsers.filter(u => u.other_id !== userId);
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Error unblocking user:', err),
    });
  }
}
