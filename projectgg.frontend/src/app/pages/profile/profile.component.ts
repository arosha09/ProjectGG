import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, RankDisplayComponent, DailyClaimComponent, RouterLink, CyberDropdownComponent],
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
  extractedAvatarColors: string[] = [];
  userGradient: string = '';
  collectionStats: any = null;

  avatarCategories: { category: string; avatars: { filename: string; url: string; path: string }[] }[] = [];
  selectedCategory = '';
  categoryDropdownOpen = false;
  avatarUploading = false;
  avatarLoading = false;
  avatarImgReady = false;
  avatarModalOpen = false;
  private systemAvatarsLoaded = false;

  // About
  editingAbout = false;
  aboutDraft = '';

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
    if (this.currentUser?.avatar) {
      if (!this.avatarImgReady) this.avatarLoading = true;
      return this.currentUser.avatar;
    }
    this.avatarLoading = false;
    const gender = this.currentUser?.gender?.toLowerCase();
    if (gender == null) return null;
    if (gender === 'prefer not to say') return '/assets/avatars/unknown.webp';
    if (gender === 'male')   return '/assets/avatars/male.webp';
    if (gender === 'female') return '/assets/avatars/female.webp';
    return '/assets/avatars/unknown.webp';
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
    this.avatarImgReady = true;
    this.avatarLoading = false;
    if (!this.userGradient) this.extractColorsFromAvatar();
  }

  onSystemAvatarLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    const sk = img.previousElementSibling as HTMLElement | null;
    sk?.classList?.add('sk-hidden');
    img.classList.add('is-loaded');
  }

  openAvatarModal(): void {
    this.avatarModalOpen = true;
    this.loadSystemAvatars();
  }

  systemAvatarsLoading = false;

  private loadSystemAvatars(): void {
    this.systemAvatarsLoading = true;
    this.http.get<{ category: string; avatars: { filename: string; url: string; path: string }[] }[]>(`${this.apiUrl}/users/avatar/system?t=${Date.now()}`).subscribe({
      next: (categories) => {
        this.avatarCategories = categories;
        this.selectedCategory = categories[0]?.category ?? '';
        this.systemAvatarsLoaded = true;
        this.systemAvatarsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.systemAvatarsLoading = false;
        this.cdr.markForCheck();
      },
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
        this.extractedAvatarColors = [];
        this.userGradient = '';
        this.avatarImgReady = false;
        this.cdr.markForCheck();
        setTimeout(() => this.extractColorsFromAvatar(), 200);
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
        this.extractedAvatarColors = [];
        this.userGradient = '';
        this.avatarImgReady = false;
        this.cdr.markForCheck();
        setTimeout(() => this.extractColorsFromAvatar(), 200);
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

  onBannerUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.usersService.uploadBanner(input.files[0]).subscribe({
      next: (res) => {
        this.currentUser = { ...this.currentUser, banner_url: res.url };
        this.usersService.updateCurrentUser(this.currentUser);
        input.value = '';
        this.cdr.markForCheck();
      },
      error: () => { input.value = ''; },
    });
  }

  onRemoveBanner(): void {
    this.usersService.deleteBanner().subscribe({
      next: () => {
        this.currentUser = { ...this.currentUser, banner_url: null };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
    });
  }

  fixSupabaseUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.replace(/qpdpzookcfrylxnrqkwo\.supabase\.co/g, 'lgesluubuaikmaigwwxq.supabase.co');
  }

  getUserGradient(): string {
    if (this.userGradient) return this.userGradient;
    const name = this.currentUser?.username ?? 'user';
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      'linear-gradient(135deg, #ff6a00 0%, #ee0979 100%)',
      'linear-gradient(135deg, #00c6fb 0%, #005bea 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return gradients[Math.abs(hash) % gradients.length];
  }

  private updateUserGradient(): void {
    if (this.extractedAvatarColors.length >= 2) {
      this.userGradient = `linear-gradient(135deg, ${this.extractedAvatarColors[0]}, ${this.extractedAvatarColors[1]})`;
    }
  }

  extractColorsFromAvatar(): void {
    const url = this.avatarDisplay;
    if (!url) return;
    if (url.includes('/assets/avatars/')) {
      const gender = this.currentUser?.gender?.toLowerCase();
      if (gender === 'male') {
        this.extractedAvatarColors = ['#1a1a1a', '#e0e0e0'];
      } else if (gender === 'female') {
        this.extractedAvatarColors = ['#1a1a1a', '#e0e0e0'];
      } else {
        this.extractedAvatarColors = ['#606060', '#b0b0b0'];
      }
      this.updateUserGradient();
      this.cdr.detectChanges();
      return;
    }
    const img = new Image();
    if (url.startsWith('http')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = 32, h = 32;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const buckets: Record<string, number> = {};
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 128) continue;
          const brightness = (r + g + b) / 3;
          if (brightness > 230 || brightness < 25) continue;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (saturation < 15) continue;
          const rr = Math.round(r / 32) * 32;
          const gg = Math.round(g / 32) * 32;
          const bb = Math.round(b / 32) * 32;
          const key = `${rr},${gg},${bb}`;
          buckets[key] = (buckets[key] || 0) + 1;
        }
        const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
        if (sorted.length < 2) return;
        const toHex = (c: number) => c.toString(16).padStart(2, '0');
        const toColor = (key: string) => {
          const [r, g, b] = key.split(',').map(Number);
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        };
        this.extractedAvatarColors = [toColor(sorted[0][0]), toColor(sorted[1][0])];
        this.updateUserGradient();
        this.cdr.detectChanges();
      } catch {}
    };
    img.src = url;
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

  // ── About ──────────────────────────────────────────────────────────────────

  startEditAbout(): void {
    this.aboutDraft = this.currentUser?.about ?? '';
    this.editingAbout = true;
  }

  saveAbout(): void {
    if (!this.editingAbout) return;
    const value = (this.aboutDraft ?? '').trim();
    this.editingAbout = false;
    if (value === (this.currentUser?.about ?? '')) {
      this.cdr.markForCheck();
      return;
    }
    this.http.patch<any>(`${this.apiUrl}/profile`, { about: value }).subscribe({
      next: (updated) => {
        this.currentUser = { ...this.currentUser, ...updated, about: value };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
      error: () => {
        this.editingAbout = true;
        this.cdr.markForCheck();
      },
    });
  }

  cancelEditAbout(): void {
    this.editingAbout = false;
    this.aboutDraft = '';
    this.cdr.markForCheck();
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
        setTimeout(() => this.extractColorsFromAvatar(), 200);
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
      next: (res) => {
        const games = res?.items ?? [];
        this.favoriteGames = games.slice(0, 10);
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