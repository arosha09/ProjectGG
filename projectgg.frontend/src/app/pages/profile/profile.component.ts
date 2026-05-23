import { Component, OnInit, ChangeDetectorRef, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { XpService } from '../../services/xp.service';
import { HeaderNavComponent } from '../../components/header-nav/header-nav.component';
import { RankDisplayComponent } from '../../components/rank-display/rank-display.component';
import { DailyClaimComponent } from '../../components/daily-claim/daily-claim.component';
import { UserRankDto, CanClaimDailyDto } from '../../models/rank.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, MatCardModule, HeaderNavComponent, RankDisplayComponent, DailyClaimComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  currentUser: any = null;
  userRank: UserRankDto | null = null;
  canClaim: CanClaimDailyDto | null = null;
  claiming = false;
  currentTheme: 'green' | 'red' | 'yellow' | 'blue' = 'green';
  currentStatus: 'online' | 'away' | 'offline' | 'invisible' = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;

  constructor(
    private readonly auth: AuthService,
    private readonly xpService: XpService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.applySavedTheme();
    this.applySavedStatus();
    this.loadRankData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getDefaultAvatar(gender?: string): string {
    if (gender === 'Male') return 'assets/male.png';
    if (gender === 'Female') return 'assets/female.png';
    return 'assets/unknown.png';
  }

  setTheme(theme: 'green' | 'red' | 'yellow' | 'blue'): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false;
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('projectgg:theme', theme);
    } catch (e) {
      console.warn('Could not persist theme:', e);
    }
  }

  private applySavedTheme(): void {
    try {
      const saved = localStorage.getItem('projectgg:theme') as any;
      if (saved === 'red' || saved === 'yellow' || saved === 'blue' || saved === 'green') {
        this.setTheme(saved);
      } else {
        this.setTheme(this.currentTheme);
      }
    } catch { }
  }

  toggleThemeDropdown(): void {
    this.themeDropdownOpen = !this.themeDropdownOpen;
    this.statusDropdownOpen = false;
    this.profileDropdownOpen = false;
  }

  setStatus(status: 'online' | 'away' | 'offline' | 'invisible'): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    try {
      localStorage.setItem('projectgg:status', status);
    } catch (e) {
      console.warn('Could not persist status:', e);
    }
  }

  private applySavedStatus(): void {
    try {
      const saved = localStorage.getItem('projectgg:status') as any;
      if (saved === 'online' || saved === 'away' || saved === 'offline' || saved === 'invisible') {
        this.currentStatus = saved;
      }
    } catch { }
  }

  toggleStatusDropdown(): void {
    this.statusDropdownOpen = !this.statusDropdownOpen;
    this.themeDropdownOpen = false;
    this.profileDropdownOpen = false;
  }

  toggleProfileDropdown(): void {
    this.profileDropdownOpen = !this.profileDropdownOpen;
    this.themeDropdownOpen = false;
    this.statusDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const themeEl = document.querySelector('app-theme-selector');
    const statusEl = document.querySelector('app-status-selector');
    const navEl = document.querySelector('app-header-nav');
    if (themeEl && !themeEl.contains(target)) this.themeDropdownOpen = false;
    if (statusEl && !statusEl.contains(target)) this.statusDropdownOpen = false;
    if (navEl && !navEl.contains(target)) this.profileDropdownOpen = false;
  }

  private loadRankData(): void {
    const userId = this.currentUser?.id;

    this.xpService.getUserRank(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rank) => {
          this.userRank = rank;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Error loading rank data:', err)
      });

    this.xpService.canClaimDaily(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          this.canClaim = status;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Error checking daily claim:', err)
      });
  }

  claimDaily(): void {
    if (this.claiming || !this.canClaim?.can_claim) return;

    this.claiming = true;
    this.xpService.claimDaily(this.currentUser?.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadRankData();
          this.claiming = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.claiming = false;
          this.cdr.markForCheck();
        }
      });
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }
}
