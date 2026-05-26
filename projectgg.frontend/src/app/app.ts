import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from './services/auth.service';
import { HeaderNavComponent } from './components/header-nav/header-nav.component';
import { AdminNavComponent } from './components/admin-nav/admin-nav.component';
import { environment } from '../environments/environment';
import { ThemeService } from './services/theme.service';
import { CursorService } from './services/cursor.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderNavComponent, AdminNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = environment.apiUrl;

  currentUser: any = null;
  currentStatus: string = 'online';
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
  ) {}

  ngOnInit(): void {
    this.cursor.init();
    this.auth.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.isAuthLoading = false;
      this.currentUser = user;
      this.isAdmin = user?.role === 'admin';
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
    this.currentStatus = status;
    try {
      localStorage.setItem('projectgg:status', status);
    } catch {}
  }

  private applySavedStatus(): void {
    try {
      const saved = localStorage.getItem('projectgg:status') as any;
      if (saved === 'online' || saved === 'away' || saved === 'offline' || saved === 'invisible') {
        this.currentStatus = saved;
      }
    } catch {}
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
