import { Component, input, output, signal, effect, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Subscription, filter, map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { CyberDropdownComponent, DropdownItem } from '../cyber-dropdown/cyber-dropdown.component';
import { ChatService, AppNotification } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { Socket } from 'socket.io-client';

@Component({
  selector: 'app-header-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, CyberDropdownComponent],
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.scss'],
})
export class HeaderNavComponent implements OnInit, OnDestroy {
  mobileMenuOpen = false;
  hideDivider = false;
  private routerSub?: Subscription;
  readonly currentStatus = input<string | null>(null);
  readonly profileDropdownOpen = input(false);
  readonly userName = input<string | null>(null);
  readonly avatarUrl = input<string | null>(null);
  readonly isAdmin = input(false);
  readonly discordConnected = input(false);
  readonly isAuthLoading = input(false);

  readonly statusChange = output<string>();
  readonly profileToggle = output<void>();
  readonly logout = output<void>();

  readonly displayAvatar = signal<string | null>(null);

  notifications: AppNotification[] = [];
  unreadCount = 0;
  showNotifications = false;
  private socket: Socket | null = null;

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
  ) {
    effect(() => {
      this.displayAvatar.set(this.avatarUrl() ?? '/assets/avatars/unknown.png');
    });
  }

  ngOnInit(): void {
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
    this.routerSub?.unsubscribe();
    this.socket?.off('notification', this._notifHandler);
  }

  private _notifHandler = () => this.loadNotifications();

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

  markAllNotifRead(): void {
    this.chatService.markAllNotificationsRead().subscribe(() => {
      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  handleAvatarError(): void {
    this.displayAvatar.set('/assets/avatars/unknown.png');
  }

  onStatusChange(status: string): void {
    this.statusChange.emit(status as any);
  }
}
