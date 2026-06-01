import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ViewContainerRef, ComponentRef, effect, Injector } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from './services/auth.service';
import { HeaderNavComponent } from './components/header-nav/header-nav.component';
import { AdminNavComponent } from './components/admin-nav/admin-nav.component';
import { MusicPlayerComponent } from './components/music-player/music-player.component';
import { environment } from '../environments/environment';
import { ThemeService } from './services/theme.service';
import { CursorService } from './services/cursor.service';
import { StatusMessageComponent } from './components/status-message/status-message.component';
import { StatusNotificationService } from './services/notification.service';
import { UserStatusService } from './services/user-status.service';
import { TaskTrackerService } from './services/task-tracker.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderNavComponent, AdminNavComponent, MusicPlayerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = environment.apiUrl;
  private statusMessageRef: ComponentRef<StatusMessageComponent> | null = null;

  @ViewChild('statusHost', { read: ViewContainerRef, static: true })
  private readonly statusHost!: ViewContainerRef;

  currentUser: any = null;
  profileDropdownOpen = false;
  isAdmin = false;
  discordConnected = false;
  isAuthLoading = true;

  constructor(
    private auth: AuthService,
    private http: HttpClient,
    public router: Router,
    private cdr: ChangeDetectorRef,
    private theme: ThemeService,
    private cursor: CursorService,
    private readonly injector: Injector,
    private readonly userStatus: UserStatusService,
    private readonly taskTracker: TaskTrackerService,
    public readonly statusNotification: StatusNotificationService,
  ) {}

  get currentStatus(): string {
    return this.userStatus.currentStatus;
  }

  ngOnInit(): void {
    this.profileDropdownOpen = false;
    this.cursor.init();
    this.userStatus.initialize();
    this.taskTracker.initialize();
    effect(() => {
      const message = this.statusNotification.message();
      const type = this.statusNotification.type();

      if (!this.statusHost) return;

      if (!message) {
        this.statusHost.clear();
        this.statusMessageRef = null;
        return;
      }

      if (!this.statusMessageRef) {
        this.statusHost.clear();
        this.statusMessageRef = this.statusHost.createComponent(StatusMessageComponent);
        this.statusMessageRef.instance.dismiss.subscribe(() => this.statusNotification.clear());
      }

      this.statusMessageRef.setInput('type', type);
      this.statusMessageRef.setInput('message', message);
      this.statusMessageRef.setInput('dismissible', true);
      this.cdr.markForCheck();
    }, { injector: this.injector });

    this.auth.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.isAuthLoading = false;
      this.currentUser = user;
      this.isAdmin = user?.role === 'admin';
      this.profileDropdownOpen = false;
      this.userStatus.syncFromUser(user);
      this.cdr.markForCheck();
    });
    this.applySavedStatus();
    this.loadConnections();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setStatus(status: string): void {
    this.userStatus.setStatus(status as any);
  }

  private applySavedStatus(): void {
    // handled by UserStatusService
  }

  toggleProfileDropdown(): void {
    this.profileDropdownOpen = !this.profileDropdownOpen;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.profileDropdownOpen) {
      this.profileDropdownOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.profileDropdownOpen) {
      const target = event.target as HTMLElement;
      const navEl = document.querySelector('app-header-nav');
      const dropdownEl = document.querySelector('app-cyber-dropdown');

      if (navEl && !navEl.contains(target) && dropdownEl && !dropdownEl.contains(target)) {
        this.profileDropdownOpen = false;
        this.cdr.markForCheck();
      }
    }
  }

  onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target?.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
  }

  getDefaultAvatar(gender?: string): string {
    const g = gender?.toLowerCase();
    if (g === 'male') return 'assets/avatars/male.png';
    if (g === 'female') return 'assets/avatars/female.png';
    return 'assets/avatars/unknown.png';
  }

  private loadConnections(): void {
    this.http.get<any[]>(`${this.apiUrl}/platform/connections`).subscribe({
      next: (conns) => {
        this.discordConnected = conns.some(c => c.platform === 'discord');
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }
}
