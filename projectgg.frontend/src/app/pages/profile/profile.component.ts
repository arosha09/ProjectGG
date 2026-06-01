import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';
import { RankDisplayComponent } from '../../components/rank-display/rank-display.component';
import { DailyClaimComponent } from '../../components/daily-claim/daily-claim.component';
import { XpService } from '../../services/xp.service';
import { UserRankDto } from '../../models/rank.model';
import { environment } from '../../../environments/environment';
import { TasksService } from '../../services/tasks.service';
import { ThemeService } from '../../services/theme.service';
import { ThemeOption } from '../../components/theme-selector/theme-selector.component';
import { CyberDropdownComponent, DropdownItem } from '../../components/cyber-dropdown/cyber-dropdown.component';
import { UserStatusService, UserStatus } from '../../services/user-status.service';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, RankDisplayComponent, DailyClaimComponent, RouterLink, CyberDropdownComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  currentUser: any = null;
  currentStatus: UserStatus = 'online';
  statusDropdownOpen = false;
  profileDropdownOpen = false;
  private destroy$ = new Subject<void>();

  userRank: UserRankDto | null = null;
  // debug
  debugMode = false;
  debugData: any = { profile: null, connections: null, rank: null, showcase: null, collectionStats: null };
  canClaim = false;
  claimLoading = false;
  loading = true;

  profileError = '';
  connectionsError = '';

  // Favorites showcase
  favoriteGames: any[] = [];
  favoriteGamesLoading = false;
  collectionStats: any = null;

  avatarCategories: { category: string; avatars: { filename: string; url: string; path: string }[] }[] = [];
  selectedCategory = '';
  categoryDropdownOpen = false;
  avatarUploading = false;
  avatarModalOpen = false;
  private systemAvatarsLoaded = false;

  // Platform connections
  platforms = [
    { id: 'steam',   name: 'Steam' },
    { id: 'discord', name: 'Discord' },
    { id: 'gog',     name: 'GOG' },
    { id: 'epic',    name: 'Epic Games' },
    { id: 'ubisoft', name: 'Ubisoft' },
    { id: 'ea',      name: 'EA App' },
  ];
  connections: any[] = [];
  discordConnected = false;

  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly auth: AuthService,
    private readonly usersService: UsersService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly xpService: XpService,
    private readonly http: HttpClient,
    private readonly tasksService: TasksService,
    readonly themeService: ThemeService,  // readonly so template can read themeService.currentTheme()
    private readonly userStatus: UserStatusService,
    private readonly chatService: ChatService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    this.currentStatus = this.userStatus.currentStatus;

    this.userStatus.currentStatus$.subscribe((status) => {
      this.currentStatus = status;
      this.cdr.markForCheck();
    });

    this.auth.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((user) => {
      if (user) {
        this.currentUser = user;
        this.cdr.markForCheck();
      }
    });

    const socket = this.chatService.connect();
    socket.on('xp-update', (data: { userId: string }) => {
      if (data.userId === this.currentUser?.id) {
        this.loadRankData();
      }
    });

    this.refreshProfile();
    this.loadConnections();
    this.loadShowcase();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.connect().off('xp-update');
  }

  // ── Theme (fully delegated to ThemeService) ────────────────────────────────

  get currentTheme(): ThemeOption {
    return this.themeService.currentTheme();
  }

  setTheme(theme: ThemeOption): void {
    this.themeService.setTheme(theme);
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  setStatus(status: UserStatus): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    this.userStatus.setStatus(status);
  }

  toggleStatusDropdown(): void {
    this.statusDropdownOpen = !this.statusDropdownOpen;
    this.profileDropdownOpen = false;
  }

  toggleProfileDropdown(): void {
    this.profileDropdownOpen = !this.profileDropdownOpen;
    this.statusDropdownOpen = false;
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────

  get avatarDisplay(): string | null {
    if (this.currentUser?.avatar) return this.currentUser.avatar;
    const gender = this.currentUser?.gender?.toLowerCase();
    if (gender == null) return null;
    if (gender === 'prefer not to say') return 'assets/avatars/unknown.png';
    if (gender === 'male')   return 'assets/avatars/male.png';
    if (gender === 'female') return 'assets/avatars/female.png';
    return 'assets/avatars/unknown.png';
  }

  get genderLabel(): string {
    return this.currentUser?.gender?.toUpperCase() ?? 'N/A';
  }

  get emailVerified(): boolean {
    return this.currentUser?.email_verified ?? false;
  }

  goToSettings(): void { this.router.navigate(['/settings']); }

  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  onAvatarLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    const sk = img.previousElementSibling as HTMLElement | null;
    sk?.classList?.add('sk-hidden');
    img.classList.add('is-loaded');
  }

  onSystemAvatarLoad(event: Event): void {
    this.onAvatarLoad(event);
  }

  openAvatarModal(): void {
    this.avatarModalOpen = true;
    this.loadSystemAvatars();
  }

  private loadSystemAvatars(): void {
    this.http.get<{ category: string; avatars: { filename: string; url: string; path: string }[] }[]>(`${this.apiUrl}/users/avatar/system?t=${Date.now()}`).subscribe({
      next: (categories) => {
        this.avatarCategories = categories;
        this.selectedCategory = categories[0]?.category ?? '';
        this.systemAvatarsLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  closeAvatarModal(): void { this.avatarModalOpen = false; }

  get activeSystemAvatars(): { filename: string; url: string; path: string }[] {
    const cat = this.avatarCategories.find(c => c.category === this.selectedCategory);
    return cat?.avatars ?? [];
  }

  get categoryItems(): DropdownItem[] {
    return this.avatarCategories.map(cat => ({
      label: cat.category || 'All',
      action: () => {
        this.selectedCategory = cat.category;
        this.categoryDropdownOpen = false;
      },
    }));
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
      error: () => { this.avatarUploading = false; },
    });
  }

  onSelectSystemAvatar(path: string): void {
    this.http.put<{ url: string }>(`${this.apiUrl}/users/avatar/select`, { path }).subscribe({
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

  // ── Rank / XP ──────────────────────────────────────────────────────────────

  private loadRankData(): void {
    const userId = this.currentUser?.id;

    if (!userId) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    let rankDone = false;
    let claimDone = false;

    const checkDone = () => {
      if (rankDone && claimDone) { this.loading = false; this.cdr.markForCheck(); }
    };

    this.xpService.getUserRank(userId).subscribe({
      next:  (rank) => { this.userRank = rank; this.debugData.rank = rank; rankDone = true; checkDone(); },
      error: ()     => { this.userRank = null; this.debugData.rank = null; rankDone = true; checkDone(); },
    });

    this.xpService.canClaimDaily(userId).subscribe({
      next:  (res) => { this.canClaim = res.can_claim; this.debugData.canClaim = res; claimDone = true; checkDone(); },
      error: ()    => { this.canClaim = false; this.debugData.canClaim = null;         claimDone = true; checkDone(); },
    });
  }

  onClaimDaily(): void {
    if (this.claimLoading) return;
    this.claimLoading = true;
    this.xpService.claimDaily(this.currentUser?.id).subscribe({
      next:  () => { this.canClaim = false; this.claimLoading = false; this.loadRankData(); },
      error: () => { this.claimLoading = false; },
    });
  }

  // ── Profile / connections ──────────────────────────────────────────────────

  private refreshProfile(): void {
    this.http.get<any>(`${this.apiUrl}/users/profile`).subscribe({
      next: (profile) => {
        this.currentUser = { ...this.currentUser, ...profile };
        this.usersService.updateCurrentUser(this.currentUser);
        this.profileError = '';
        this.debugData.profile = profile;
        this.loadRankData();
        this.loadFavoriteGames();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.profileError = err.status === 401 ? 'Session expired. Please log in again.' : 'Failed to load profile data.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadConnections(): void {
    this.http.get<any[]>(`${this.apiUrl}/platform/connections`).subscribe({
      next: (conns) => {
        this.connections = conns;
        this.discordConnected = conns.some(c => c.platform === 'discord');
        this.connectionsError = '';
        this.debugData.connections = conns;
        this.cdr.markForCheck();
      },
      error: () => {
        this.connectionsError = 'Failed to load connected accounts.';
        this.cdr.markForCheck();
      },
    });
  }

  loadFavoriteGames(): void {
    if (!this.currentUser?.id) return;
    this.favoriteGamesLoading = true;
    this.chatService.getUserShowcase(this.currentUser?.id).subscribe({
      next: (games) => {
        this.favoriteGames = (games ?? []).slice(0, 10);
        this.debugData.showcase = this.favoriteGames;
        this.favoriteGamesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.favoriteGames = [];
        this.favoriteGamesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ===== CARD SHOWCASE =====

  loadShowcase(): void {
    this.chatService.getCollectionStats().subscribe({
      next: (stats) => { this.collectionStats = stats; this.debugData.collectionStats = stats; this.cdr.markForCheck(); },
    });
  }

  getConnection(platform: string): any {
    return this.connections.find(c => c.platform === platform);
  }

  getPlatformLogo(id: string): string {
    return `/assets/icons/platforms/${id}.svg`;
  }

  tierColor(tier?: string): string {
    const colors: Record<string, string> = {
      common: '#8c96a8', uncommon: '#00e676', rare: '#5fb6ff',
      epic: '#aa44ff',   legendary: '#ffd700',
    };
    return colors[tier ?? 'common'] || '#8c96a8';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!document.querySelector('app-status-selector')?.contains(target)) this.statusDropdownOpen = false;
    if (!document.querySelector('app-header-nav')?.contains(target))      this.profileDropdownOpen = false;
  }

  get isAdmin(): boolean { return this.currentUser?.role === 'admin'; }

  get isDev(): boolean { return this.currentUser?.role === 'dev'; }

  toggleDebugMode(): void {
    if (!this.isDev) return;
    this.debugMode = !this.debugMode;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}