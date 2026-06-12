import { Component, input, output, signal, effect, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Subscription, Subject, filter, map, takeUntil } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { CyberDropdownComponent, DropdownItem } from '../cyber-dropdown/cyber-dropdown.component';
import { ChatService, AppNotification } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { MusicPlayerService, Track } from '../../services/music-player.service';
import { SoundService } from '../../services/sound.service';
import { Socket } from 'socket.io-client';

@Component({
  selector: 'app-header-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatIconModule, CyberDropdownComponent],
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.scss'],
})
export class HeaderNavComponent implements OnInit, OnDestroy, AfterViewChecked {
  mobileMenuOpen = false;
  hideDivider = false;
  private destroy$ = new Subject<void>();
  private routerSub?: Subscription;
  readonly currentStatus = input<string | null>(null);
  readonly profileDropdownOpen = input(false);
  readonly userName = input<string | null>(null);
  readonly avatarUrl = input<string | null>(null);
  readonly isAdmin = input(false);
  readonly discordConnected = input(false);
  readonly isAuthLoading = input(false);

  // Dynamic island music state
  musicTrack: Track | null = null;
  musicPlaying = false;
  musicShuffle = false;
  musicRepeat: 'off' | 'all' | 'one' = 'off';
  musicVolume = 0.8;
  musicProgress = 0;
  vizBars: number[] = new Array(10).fill(0);
  titleScrolling = false;
  queue: Track[] = [];

  @ViewChild('miniTitleInfo') miniTitleInfoRef?: ElementRef<HTMLElement>;

  readonly statusChange = output<string>();
  readonly profileToggle = output<void>();
  readonly logout = output<void>();
  readonly tradeOpened = output<{ tradeId: number; otherUserId: string; otherUsername: string; otherAvatar: string | null }>();

  readonly displayAvatar = signal<string | null>(null);
  avatarLoading = signal(false);

  notifications: AppNotification[] = [];
  unreadCount = 0;
  showNotifications = false;
  private socket: Socket | null = null;

  notifCategory: 'all' | 'tasks' | 'social' | 'trades' | 'system' = 'all';
  
  readonly notifCategories: Array<{ id: 'all' | 'tasks' | 'social' | 'trades' | 'system'; label: string; icon: string }> = [
    { id: 'all', label: 'All', icon: 'inbox' },
    { id: 'tasks', label: 'Tasks', icon: 'assignment' },
    { id: 'social', label: 'Social', icon: 'people' },
    { id: 'trades', label: 'Trades', icon: 'swap_horiz' },
    { id: 'system', label: 'System', icon: 'settings' },
  ];

  profileItems: DropdownItem[] = [
    { label: 'PROFILE', icon: 'person', link: '/profile' },
    { label: 'MISSIONS', icon: 'assignment', link: '/tasks' },
    { label: 'SETTINGS', icon: 'settings', link: '/settings' },
    { label: 'ADMIN PANEL', icon: 'admin_panel_settings', link: '/admin', adminOnly: true },
    { label: 'LOGOUT', icon: 'logout', action: () => this.logout.emit() },
  ];

  constructor(
    private readonly router: Router,
    private readonly activatedRoute: ActivatedRoute,
    private readonly chatService: ChatService,
    private readonly auth: AuthService,
    public readonly musicService: MusicPlayerService,
    private readonly cdr: ChangeDetectorRef,
    private readonly sound: SoundService,
  ) {
    effect(() => {
      const url = this.avatarUrl();
      this.displayAvatar.set(url ?? '/assets/avatars/unknown.webp');
      if (url) this.avatarLoading.set(true);
    });
  }

  ngOnInit(): void {
    this.musicService.track$.pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.titleScrolling = false;
      this.musicTrack = t;
      this.cdr.markForCheck();
    });
    this.musicService.playing$.pipe(takeUntil(this.destroy$)).subscribe(p => { this.musicPlaying = p; this.cdr.markForCheck(); });
    this.musicService.prog$.pipe(takeUntil(this.destroy$)).subscribe(p => { this.musicProgress = p; this.cdr.markForCheck(); });
    this.musicService.shuffleObs$.pipe(takeUntil(this.destroy$)).subscribe(s => { this.musicShuffle = s; this.cdr.markForCheck(); });
    this.musicService.repeatObs$.pipe(takeUntil(this.destroy$)).subscribe(r => { this.musicRepeat = r; this.cdr.markForCheck(); });
    this.musicService.volumeObs$.pipe(takeUntil(this.destroy$)).subscribe(v => { this.musicVolume = v; this.cdr.markForCheck(); });
    this.musicService.queueObs$.pipe(takeUntil(this.destroy$)).subscribe(q => { this.queue = q; this.cdr.markForCheck(); });
    this.musicService.freqData$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      const step = data.length / 10;
      this.vizBars = Array.from({ length: 10 }, (_, i) => {
        const idx = Math.min(Math.floor(i * step), data.length - 1);
        return data[idx];
      });
      this.cdr.markForCheck();
    });

    // Restart viz loop if music is already playing (e.g. navigating back to this page)
    if (this.musicService.isPlayingValue) {
      this.musicService.startVizLoop();
    }

    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
    ).subscribe(route => {
      this.hideDivider = !!route.snapshot.data['hideDivider'];
      this.mobileMenuOpen = false;
    });
    this.initNotifications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.routerSub?.unsubscribe();
    this.socket?.off('notification', this._notifHandler);
  }

  ngAfterViewChecked(): void {
    this.checkTitleOverflow();
  }

  private checkTitleOverflow(): void {
    const el = this.miniTitleInfoRef?.nativeElement;
    if (!el) return;
    const shouldScroll = el.scrollWidth > el.clientWidth + 2;
    if (shouldScroll !== this.titleScrolling) {
      this.titleScrolling = shouldScroll;
      this.cdr.markForCheck();
    }
  }

  private _notifHandler = (data: AppNotification) => {
      this.sound.play(this.mapNotifTypeToSound(data?.type, data?.title));
      if (data?.id) {
        const exists = this.notifications.some(n => n.id === data.id);
        if (!exists) {
          this.notifications = [data, ...this.notifications];
          if (!data.read) {
            this.unreadCount++;
          }
          this.cdr.markForCheck();
        }
      } else {
        this.loadNotifications();
      }
    };

  private mapNotifTypeToSound(type?: string, title?: string): 'notification_msg' | 'notification_mention' | 'notification_friend_req' | 'notification_msg' {
    const t = type?.toLowerCase() ?? '';
    const tt = title?.toLowerCase() ?? '';
    if (tt.includes('friend') || t.includes('friend')) return 'notification_friend_req';
    if (tt.includes('mention') || t.includes('mention')) return 'notification_mention';
    return 'notification_msg';
  }

  private initNotifications(): void {
    if (!this.auth.isAuthenticated()) return;
    this.loadNotifications();
    try {
      this.socket = this.chatService.connect();
      this.socket.on('notification', this._notifHandler);
    } catch {}
  }

  loadNotifications(): void {
    this.chatService.getNotifications().subscribe({
      next: (data) => {
        this.notifications = data;
        this.unreadCount = data.filter(n => !n.read).length;
      },
    });
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
  }

  @HostListener('document:click', ['$event'])
  handleDocClick(event: MouseEvent): void {
    if (this.showNotifications) {
      const target = event.target as HTMLElement;
      if (!target.closest('.header-notif-wrap') && !target.closest('.header-notif-panel')) {
        this.showNotifications = false;
      }
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.showNotifications = false;
  }

  markNotifRead(n: AppNotification): void {
    if (n.read) return;
    this.chatService.markNotificationRead(n.id).subscribe(() => {
      n.read = true;
      this.unreadCount = this.notifications.filter(x => !x.read).length;
    });
  }

  handleNotifClick(n: AppNotification): void {
    this.markNotifRead(n);
    const type = n.type?.toLowerCase() ?? '';
    const isTrade = type.includes('trade') || type.includes('swap') || type.includes('card');
    if (isTrade && n.data?.tradeId) {
      const otherUserId = n.data.fromUserId ?? n.data.otherUserId ?? '';
      this.tradeOpened.emit({
        tradeId: Number(n.data.tradeId),
        otherUserId,
        otherUsername: '',
        otherAvatar: null,
      });
      this.showNotifications = false;
    }
  }

  markAllNotifRead(): void {
    this.chatService.markAllNotificationsRead().subscribe(() => {
      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
    });
  }

  clearAllNotifications(): void {
    this.chatService.clearAllNotifications().subscribe(() => {
      this.notifications = [];
      this.unreadCount = 0;
    });
  }

  deleteNotif(n: AppNotification): void {
    this.chatService.deleteNotification(n.id).subscribe(() => {
      this.notifications = this.notifications.filter(x => x.id !== n.id);
      this.unreadCount = this.notifications.filter(x => !x.read).length;
    });
  }

  get filteredNotifications(): AppNotification[] {
    if (this.notifCategory === 'all') return this.notifications;
    return this.notifications.filter(n => this.getNotifCategory(n) === this.notifCategory);
  }

  getNotifCategory(n: AppNotification): 'tasks' | 'social' | 'trades' | 'system' {
    const type = n.type?.toLowerCase() ?? '';
    if (type.includes('task') || type.includes('mission') || type.includes('achievement') || type.includes('xp') || type.includes('reward')) {
      return 'tasks';
    }
    if (type.includes('friend') || type.includes('dm') || type.includes('message') || type.includes('server') || type.includes('guild')) {
      return 'social';
    }
    if (type.includes('trade') || type.includes('swap') || type.includes('card')) {
      return 'trades';
    }
    return 'system';
  }

  getCategoryCount(cat: 'all' | 'tasks' | 'social' | 'trades' | 'system'): number {
    if (cat === 'all') return this.notifications.length;
    return this.notifications.filter(n => this.getNotifCategory(n) === cat).length;
  }

  getCategoryUnreadCount(cat: 'all' | 'tasks' | 'social' | 'trades' | 'system'): number {
    if (cat === 'all') return this.unreadCount;
    return this.notifications.filter(n => !n.read && this.getNotifCategory(n) === cat).length;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  handleAvatarError(): void {
    this.displayAvatar.set('/assets/avatars/unknown.webp');
    this.avatarLoading.set(false);
  }

  handleAvatarLoad(): void {
    this.avatarLoading.set(false);
  }

  onStatusChange(status: string): void {
    this.statusChange.emit(status as any);
  }

  private prevVolume = 0.8;

  onVolumeChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.musicService.setVolume(val);
  }

  toggleMute(): void {
    if (this.musicVolume > 0) {
      this.prevVolume = this.musicVolume;
      this.musicService.setVolume(0);
    } else {
      this.musicService.setVolume(this.prevVolume);
    }
  }
}
