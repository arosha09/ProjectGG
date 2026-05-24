import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';
import { HeaderNavComponent } from '../../components/header-nav/header-nav.component';
import { RankDisplayComponent } from '../../components/rank-display/rank-display.component';
import { DailyClaimComponent } from '../../components/daily-claim/daily-claim.component';
import { XpService } from '../../services/xp.service';
import { UserRankDto } from '../../models/rank.model';
import { environment } from '../../../environments/environment';
import { Game } from '../../models/game.model';
import { TasksService } from '../../services/tasks.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, HeaderNavComponent, RankDisplayComponent, DailyClaimComponent, RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  currentUser: any = null;
  currentTheme: 'green' | 'red' | 'yellow' | 'blue' = 'green';
  currentStatus: 'online' | 'away' | 'offline' | 'invisible' = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;

  userRank: UserRankDto | null = null;
  canClaim = false;
  claimLoading = false;
  loading = true;

  systemAvatars: { filename: string; url: string }[] = [];
  avatarUploading = false;
  avatarModalOpen = false;
  private systemAvatarsLoaded = false;

  // Platform connections
  platforms = [
    { id: 'steam', name: 'Steam' },
    { id: 'discord', name: 'Discord' },
    { id: 'gog', name: 'GOG' },
    { id: 'epic', name: 'Epic Games' },
    { id: 'ubisoft', name: 'Ubisoft' },
    { id: 'ea', name: 'EA App' },
  ];
  connections: any[] = [];
  discordConnected = false;

  collectedGames: Game[] = [];
  collectedGamesLoading = false;
  collectedGamesPage = 1;
  collectedGamesTotalPages = 1;
  readonly pageSize = 12;

  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly auth: AuthService,
    private readonly usersService: UsersService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly xpService: XpService,
    private readonly http: HttpClient,
    private readonly tasksService: TasksService,
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
    this.refreshProfile();
    this.loadConnections();
    this.loadCollectedGames();
  }

  private refreshProfile(): void {
    this.http.get<any>(`${this.apiUrl}/users/profile`).subscribe({
      next: (profile) => {
        this.currentUser = { ...this.currentUser, ...profile };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {}

  get avatarDisplay(): string | null {
    if (this.currentUser?.avatar) return this.currentUser.avatar;
    const gender = this.currentUser?.gender?.toLowerCase();
    if (gender == null) return null;
    if (gender === 'prefer not to say') return 'assets/unknown.png';
    if (gender === 'male') return 'assets/male.png';
    if (gender === 'female') return 'assets/female.png';
    return 'assets/unknown.png';
  }

  get genderLabel(): string {
    const gender = this.currentUser?.gender;
    if (gender == null) return 'N/A';
    return gender;
  }

  get emailVerified(): boolean {
    return this.currentUser?.email_verified ?? false;
  }

  goToSettings(): void {
    this.router.navigate(['/settings']);
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  openAvatarModal(): void {
    this.avatarModalOpen = true;
    if (!this.systemAvatarsLoaded) {
      this.loadSystemAvatars();
    }
  }

  closeAvatarModal(): void {
    this.avatarModalOpen = false;
  }

  private loadSystemAvatars(): void {
    this.http.get<{ filename: string; url: string }[]>(`${this.apiUrl}/users/avatar/system`).subscribe({
      next: (avatars) => {
        this.systemAvatars = avatars;
        this.systemAvatarsLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  onAvatarUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.avatarUploading = true;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    this.http.post<{ url: string }>(`${this.apiUrl}/users/avatar/upload`, formData).subscribe({
      next: (res) => {
        this.avatarUploading = false;
        this.avatarModalOpen = false;
        this.currentUser = { ...this.currentUser, avatar: res.url };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
      error: () => {
        this.avatarUploading = false;
      },
    });
  }

  onSelectSystemAvatar(filename: string): void {
    this.http.put<{ url: string }>(`${this.apiUrl}/users/avatar/select`, { filename }).subscribe({
      next: (res) => {
        this.avatarModalOpen = false;
        this.currentUser = { ...this.currentUser, avatar: res.url };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  onDeleteAvatar(): void {
    this.http.delete<{ success: boolean }>(`${this.apiUrl}/users/avatar`).subscribe({
      next: () => {
        this.currentUser = { ...this.currentUser, avatar: null };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  private loadRankData(): void {
    const userId = this.currentUser?.id;
    let rankDone = false;
    let claimDone = false;

    const checkDone = () => {
      if (rankDone && claimDone) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    };

    this.xpService.getUserRank(userId).subscribe({
      next: (rank) => {
        this.userRank = rank;
        rankDone = true;
        checkDone();
      },
      error: () => {
        this.userRank = null;
        rankDone = true;
        checkDone();
      },
    });

    this.xpService.canClaimDaily(userId).subscribe({
      next: (res) => {
        this.canClaim = res.can_claim;
        claimDone = true;
        checkDone();
      },
      error: () => {
        this.canClaim = false;
        claimDone = true;
        checkDone();
      },
    });
  }

  onClaimDaily(): void {
    if (this.claimLoading) return;
    this.claimLoading = true;
    const userId = this.currentUser?.id;
    this.xpService.claimDaily(userId).subscribe({
      next: () => {
        this.canClaim = false;
        this.claimLoading = false;
        this.loadRankData();
      },
      error: () => {
        this.claimLoading = false;
      },
    });
  }

  // Platform connections
  loadConnections(): void {
    this.http.get<any[]>(`${this.apiUrl}/platform/connections`).subscribe({
      next: (conns) => {
        this.connections = conns;
        this.discordConnected = conns.some(c => c.platform === 'discord');
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  loadCollectedGames(): void {
    this.collectedGamesLoading = true;
    this.tasksService.getCollectedGames(this.collectedGamesPage, this.pageSize).subscribe({
      next: (games) => {
        this.collectedGames = games;
        this.collectedGamesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.collectedGamesLoading = false; this.cdr.markForCheck(); },
    });
  }

  get collectedGameCount(): number {
    return this.collectedGames.length;
  }

  getConnection(platform: string): any {
    return this.connections.find(c => c.platform === platform);
  }

  getPlatformLogo(id: string): string {
    const slugs: Record<string, string> = { steam: 'steam', discord: 'discord', gog: 'gogdotcom', epic: 'epicgames', ubisoft: 'ubisoft', ea: 'ea', spotify: 'spotify', youtube_music: 'youtubemusic', apple_music: 'applemusic' };
    return `https://cdn.simpleicons.org/${slugs[id] ?? id}/ffffff`;
  }

  tierColor(tier?: string): string {
    const colors: Record<string, string> = {
      common: '#8c96a8',
      uncommon: '#00e676',
      rare: '#5fb6ff',
      epic: '#aa44ff',
      legendary: '#ffd700',
    };
    return colors[tier ?? 'common'] || '#8c96a8';
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

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }
}
