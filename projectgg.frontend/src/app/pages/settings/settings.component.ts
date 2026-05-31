import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';
import { GamesService } from '../../services/games.service';
import { ThemeService } from '../../services/theme.service';
import { CursorService, CursorSet, CursorType } from '../../services/cursor.service';
import { DropdownItem } from '../../components/cyber-dropdown/cyber-dropdown.component';
import { CyberDropdownComponent } from '../../components/cyber-dropdown/cyber-dropdown.component';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';
import { UserStatusService, UserStatus } from '../../services/user-status.service';
import { environment } from '../../../environments/environment';

interface PlatformConn {
  id: number;
  user_id: number;
  platform: string;
  platform_user_id: string | null;
  platform_username: string | null;
  connected_at: string;
  last_synced_at: string | null;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    CyberDropdownComponent,
    StatusMessageComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  activeSection: 'profile' | 'password' | 'connections' | 'appearance' = 'profile';
  currentUser: any = null;
  currentTheme: 'green' | 'red' | 'yellow' | 'blue' | 'custom' = 'green';
  customColor = '#00f0ff';
  customColorModalOpen = false;
  currentStatus: UserStatus = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;

  // Appearance settings
  availableThemes = [
    { id: 'green', label: 'GREEN', color: '#00ff88' },
    { id: 'red', label: 'RED', color: '#ff5f6d' },
    { id: 'yellow', label: 'GOLD', color: '#ffd700' },
    { id: 'blue', label: 'AZURE', color: '#5fb6ff' },
    { id: 'custom', label: 'CUSTOM', color: '' },
  ];

  // Cursor settings
  previewCursorSetId = 'cyber';
  previewCursorType: CursorType = 'default';
  cursorSetDropdownOpen = false;

  get cursorSets(): CursorSet[] {
    return this.cursor.cursorSets;
  }

  get appliedCursorSetId(): string {
    return this.cursor.currentSetId;
  }

  get appliedCursorSet() {
    return this.cursor.currentSet;
  }

  get previewCursorSet() {
    return this.cursorSets.find((set) => set.id === this.previewCursorSetId) ?? this.cursorSets[0];
  }

  get cursorSetItems(): DropdownItem[] {
    return this.cursorSets.map((set) => ({
      label: set.label,
      action: () => this.selectCursorSet(set.id),
    }));
  }

  get previewCursorTypes(): { id: CursorType; label: string }[] {
    return [
      { id: 'default', label: 'Normal' },
      { id: 'pointer', label: 'Pointer' },
      { id: 'text', label: 'Text' },
      { id: 'crosshair', label: 'Crosshair' },
      { id: 'wait', label: 'Wait' },
      { id: 'busy', label: 'Busy' },
      { id: 'help', label: 'Help' },
      { id: 'notAllowed', label: 'Not Allowed' },
    ];
  }

  get previewTypeLabel(): string {
    const type = this.previewCursorTypes.find((t) => t.id === this.previewCursorType);
    return type?.label ?? 'Normal';
  }

  name = '';
  username = '';
  email = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  profileMessage = '';
  profileMessageType: 'success' | 'error' = 'success';
  passwordMessage = '';
  passwordMessageType: 'success' | 'error' = 'success';
  appearanceMessage = '';
  appearanceMessageType: 'success' | 'error' = 'success';

  saving = false;
  loading = true;
  changingPassword = false;
  sendingVerification = false;
  verificationSent = false;
  verifyCode = '';
  submittingCode = false;
  verifyMessage = '';
  verifyMessageType: 'success' | 'error' = 'success';
  message = '';
  messageType: 'success' | 'error' = 'success';

  // Platform connections
  gamingPlatforms = [
    { id: 'steam', name: 'Steam' },
    { id: 'gog', name: 'GOG' },
    { id: 'epic', name: 'Epic Games' },
    { id: 'ubisoft', name: 'Ubisoft' },
    { id: 'ea', name: 'EA App' },
  ];

  musicPlatforms = [
    { id: 'discord', name: 'Discord' },
    { id: 'youtube_music', name: 'YouTube Music' },
    { id: 'spotify', name: 'Spotify' },
    { id: 'apple_music', name: 'Apple Music' },
  ];

  get platforms() {
    return [...this.gamingPlatforms, ...this.musicPlatforms];
  }
  connections: PlatformConn[] = [];
  discordConnected = false;
  linking = false;
  importing = false;
  importResult = '';
  importError = false;
  manualPlatform: string | null = null;
  manualUsername = '';

  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly auth: AuthService,
    private readonly usersService: UsersService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly http: HttpClient,
    private readonly games: GamesService,
    private readonly cursor: CursorService,
    private readonly themeService: ThemeService,
    private readonly userStatus: UserStatusService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.previewCursorSetId = this.cursor.currentSetId;
    this.applySavedTheme();
    this.currentStatus = this.userStatus.currentStatus;
    this.populateForm();
    this.refreshProfile();

    this.userStatus.currentStatus$.subscribe((status) => {
      this.currentStatus = status;
      this.cdr.markForCheck();
    });

    // Check for callback results / highlight in query params
    this.route.queryParams.subscribe((params) => {
      if (params['section'] === 'connections') {
        this.activeSection = 'connections';
        this.loadConnections();
        setTimeout(() => {
          const el = document.querySelector('.platform-section:last-child');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
      if (params['highlight'] === 'discord') {
        this.activeSection = 'connections';
        this.loadConnections();
        setTimeout(() => {
          const el = document.querySelector('.platform-row');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
      if (params['platform'] === 'steam' && params['connected'] === 'true') {
        this.importResult = 'Steam account connected!';
        this.importError = false;
        this.loadConnections();
      } else if (params['platform'] === 'steam' && params['error']) {
        this.importResult = decodeURIComponent(params['error']);
        this.importError = true;
      } else if (params['platform'] === 'discord' && params['connected'] === 'true') {
        this.importResult = 'Discord account connected!';
        this.importError = false;
        this.loadConnections();
      } else if (params['platform'] === 'discord' && params['error']) {
        this.importResult = decodeURIComponent(params['error']);
        this.importError = true;
      } else if (params['platform'] === 'spotify' && params['connected'] === 'true') {
        this.importResult = 'Spotify account connected!';
        this.importError = false;
        this.loadConnections();
      } else if (params['platform'] === 'youtube-music' && params['connected'] === 'true') {
        this.importResult = 'YouTube Music account connected!';
        this.importError = false;
        this.loadConnections();
      } else if (params['platform'] === 'apple-music' && params['connected'] === 'true') {
        this.importResult = 'Apple Music account connected!';
        this.importError = false;
        this.loadConnections();
      }
    });
  }

  private refreshProfile(): void {
    this.http.get<any>(`${this.apiUrl}/users/profile`).subscribe({
      next: (profile) => {
        this.currentUser = { ...this.currentUser, ...profile };
        this.usersService.updateCurrentUser(this.currentUser);
        this.populateForm();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private populateForm(): void {
    this.name = this.currentUser?.name || '';
    this.username = this.currentUser?.username || '';
    this.email = this.currentUser?.email || '';
  }

  get avatarDisplay(): string | null {
    if (this.currentUser?.avatar) return this.currentUser.avatar;
    const gender = this.currentUser?.gender?.toLowerCase();
    if (gender == null) return null;
    if (gender === 'prefer not to say') return 'assets/avatars/unknown.png';
    if (gender === 'male') return 'assets/avatars/male.png';
    if (gender === 'female') return 'assets/avatars/female.png';
    return 'assets/avatars/unknown.png';
  }

  get emailVerified(): boolean {
    return this.currentUser?.email_verified ?? false;
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  saveProfile(): void {
    this.message = '';
    const body: any = {};
    if (this.name !== this.currentUser?.name) body.name = this.name;
    if (this.username !== this.currentUser?.username) body.username = this.username;
    if (this.email !== this.currentUser?.email) body.email = this.email;

    if (Object.keys(body).length === 0) {
      this.message = 'No changes to save';
      this.messageType = 'error';
      return;
    }

    this.saving = true;
    this.http
      .put<{ name: string; username: string; email: string }>(`${this.apiUrl}/users/profile`, body)
      .subscribe({
        next: (updated) => {
          this.saving = false;
          const user = { ...this.currentUser, ...updated };
          this.currentUser = user;
          this.usersService.updateCurrentUser(user);
          this.message = 'Profile updated successfully';
          this.messageType = 'success';
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.saving = false;
          this.message = err.error?.message || 'Failed to update profile';
          this.messageType = 'error';
          this.cdr.markForCheck();
        },
      });
  }

  changePassword(): void {
    this.message = '';
    if (!this.currentPassword || !this.newPassword) {
      this.message = 'Fill in both password fields';
      this.messageType = 'error';
      return;
    }
    if (this.newPassword.length < 6) {
      this.message = 'New password must be at least 6 characters';
      this.messageType = 'error';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.message = 'Passwords do not match';
      this.messageType = 'error';
      return;
    }

    this.changingPassword = true;
    this.http
      .post<{ message: string }>(`${this.apiUrl}/auth/change-password`, {
        current_password: this.currentPassword,
        new_password: this.newPassword,
      })
      .subscribe({
        next: (res) => {
          this.changingPassword = false;
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';
          this.message = res.message;
          this.messageType = 'success';
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.changingPassword = false;
          this.message = err.error?.message || 'Failed to change password';
          this.messageType = 'error';
          this.cdr.markForCheck();
        },
      });
  }

  resendVerification(): void {
    this.verificationSent = false;
    this.verifyCode = '';
    this.verifyMessage = '';
    this.sendingVerification = true;
    this.http.post<{ message: string }>(`${this.apiUrl}/auth/send-verification`, {}).subscribe({
      next: () => {
        this.sendingVerification = false;
        this.verificationSent = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.sendingVerification = false;
        this.verifyMessage = err.error?.message || 'Failed to send verification';
        this.verifyMessageType = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  verifyWithCode(): void {
    this.verifyMessage = '';
    const code = this.verifyCode.trim().toUpperCase();
    if (!code) {
      this.verifyMessage = 'Enter the code from your email';
      this.verifyMessageType = 'error';
      return;
    }
    this.submittingCode = true;
    this.http.post<{ message: string }>(`${this.apiUrl}/auth/verify-email`, { code }).subscribe({
      next: () => {
        this.submittingCode = false;
        this.verifyMessage = 'Email verified successfully!';
        this.verifyMessageType = 'success';
        this.currentUser = { ...this.currentUser, email_verified: true };
        this.usersService.updateCurrentUser(this.currentUser);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.submittingCode = false;
        this.verifyMessage = err.error?.message || 'Verification failed';
        this.verifyMessageType = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  // ================================================================
  // PLATFORM CONNECTIONS
  // ================================================================
  getConnection(platform: string): PlatformConn | undefined {
    return this.connections.find((c) => c.platform === platform);
  }

  loadConnections(): void {
    this.http.get<PlatformConn[]>(`${this.apiUrl}/platform/connections`).subscribe({
      next: (conns) => {
        this.connections = conns;
        this.discordConnected = conns.some((c) => c.platform === 'discord');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.linking = false;
        this.importResult = err.error?.message || 'Failed to get Steam auth URL';
        this.importError = true;
        this.cdr.markForCheck();
      },
    });
  }

  linkSteam(): void {
    this.linking = true;
    this.http.get<{ url: string }>(`${this.apiUrl}/platform/steam/auth-url`).subscribe({
      next: (res) => {
        this.linking = false;
        window.location.href = res.url;
      },
      error: (err) => {
        this.linking = false;
        this.importResult = err.error?.message || 'Failed to get Steam auth URL';
        this.importError = true;
        this.cdr.markForCheck();
      },
    });
  }

  linkDiscord(): void {
    this.linking = true;
    this.http.get<{ url: string }>(`${this.apiUrl}/platform/discord/auth-url`).subscribe({
      next: (res) => {
        this.linking = false;
        window.location.href = res.url;
      },
      error: (err) => {
        this.linking = false;
        this.importResult = err.error?.message || 'Failed to get Discord auth URL';
        this.importError = true;
        this.cdr.markForCheck();
      },
    });
  }

  linkSpotify(): void {
    this.games.getAuthUrl('spotify').subscribe({
      next: (res: any) => {
        if (res?.url) window.location.href = res.url;
      },
      error: (err) => {
        this.importResult = `Spotify auth failed: ${err.message}`;
      },
    });
  }

  linkYoutubeMusic(): void {
    this.games.getAuthUrl('youtube-music').subscribe({
      next: (res: any) => {
        if (res?.url) window.location.href = res.url;
      },
      error: (err) => {
        this.importResult = `YouTube Music auth failed: ${err.message}`;
      },
    });
  }

  linkAppleMusic(): void {
    this.games.getAuthUrl('apple-music').subscribe({
      next: (res: any) => {
        if (res?.url) window.location.href = res.url;
      },
      error: (err) => {
        this.importResult = `Apple Music auth failed: ${err.message}`;
      },
    });
  }

  importSteam(): void {
    this.importing = true;
    this.importResult = '';
    this.http
      .post<{ imported: number; total: number }>(`${this.apiUrl}/platform/steam/import`, {})
      .subscribe({
        next: (res) => {
          this.importing = false;
          this.importResult = `Imported ${res.imported} / ${res.total} games from Steam`;
          this.importError = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.importing = false;
          this.importResult = err.error?.message || 'Import failed';
          this.importError = true;
          this.cdr.markForCheck();
        },
      });
  }

  unlinkPlatform(platform: string): void {
    if (!confirm(`Unlink your ${this.getPlatformName(platform)} account?`)) return;
    this.linking = true;
    this.http.delete(`${this.apiUrl}/platform/unlink/${platform}`).subscribe({
      next: () => {
        this.linking = false;
        this.loadConnections();
        this.importResult = `${this.getPlatformName(platform)} unlinked`;
        this.importError = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.linking = false;
        this.importResult = err.error?.message || 'Failed to unlink';
        this.importError = true;
        this.cdr.markForCheck();
      },
    });
  }

  getPlatformName(id: string): string {
    return this.platforms.find((p) => p.id === id)?.name ?? id;
  }

  getPlatformLogo(id: string): string {
    const slugs: Record<string, string> = {
      steam: 'steam',
      discord: 'discord',
      gog: 'gogdotcom',
      epic: 'epicgames',
      ubisoft: 'ubisoft',
      ea: 'ea',
      spotify: 'spotify',
      youtube_music: 'youtubemusic',
      apple_music: 'applemusic',
    };
    return `https://cdn.simpleicons.org/${slugs[id] ?? id}/ffffff`;
  }

  openManualLink(platform: string): void {
    this.manualPlatform = platform;
    this.manualUsername = '';
  }

  cancelManualLink(): void {
    this.manualPlatform = null;
    this.manualUsername = '';
  }

  confirmManualLink(): void {
    if (!this.manualPlatform || !this.manualUsername.trim()) return;
    this.linking = true;
    this.http
      .post(`${this.apiUrl}/platform/link`, {
        platform: this.manualPlatform,
        username: this.manualUsername.trim(),
      })
      .subscribe({
        next: () => {
          this.linking = false;
          this.manualPlatform = null;
          this.manualUsername = '';
          this.loadConnections();
          this.importResult = `${this.getPlatformName(this.manualPlatform!)} linked!`;
          this.importError = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.linking = false;
          this.importResult = err.error?.message || 'Failed to link';
          this.importError = true;
          this.cdr.markForCheck();
        },
      });
  }

  setTheme(theme: 'green' | 'red' | 'yellow' | 'blue' | 'custom'): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false;
    this.themeService.setTheme(theme);
  }

  private applySavedTheme(): void {
    const theme = this.themeService.currentTheme();
    this.currentTheme = theme;
    this.customColor = this.themeService.customColor();
    if (theme === 'custom') {
      document.documentElement.setAttribute('data-theme', 'custom');
    }
  }

  setStatus(status: UserStatus): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    this.userStatus.setStatus(status);
  }

  toggleThemeDropdown(): void {
    this.themeDropdownOpen = !this.themeDropdownOpen;
    this.statusDropdownOpen = false;
    this.profileDropdownOpen = false;
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
    const cursorWrapper = document.querySelector('.cursor-selector-wrapper');

    if (themeEl && !themeEl.contains(target)) this.themeDropdownOpen = false;
    if (statusEl && !statusEl.contains(target)) this.statusDropdownOpen = false;
    if (navEl && !navEl.contains(target)) this.profileDropdownOpen = false;
    if (cursorWrapper && !cursorWrapper.contains(target)) this.cursorSetDropdownOpen = false;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  // Section navigation
  setActiveSection(section: 'profile' | 'password' | 'connections' | 'appearance'): void {
    this.activeSection = section;
    if (section === 'connections') {
      this.loadConnections();
    }
  }

  // Appearance & Theme handling
  changeTheme(themeId: string): void {
    if (themeId === 'custom') {
      this.customColorModalOpen = true;
      this.currentTheme = 'custom';
      this.themeService.setCustomColor(this.customColor);
      this.setTheme('custom');
      return;
    }
    this.customColorModalOpen = false;
    this.currentTheme = themeId as any;
    this.setTheme(this.currentTheme);
    this.appearanceMessage = 'Theme updated successfully';
    this.appearanceMessageType = 'success';
    setTimeout(() => (this.appearanceMessage = ''), 3000);
  }

  closeCustomColorModal(): void {
    this.customColorModalOpen = false;
    this.currentTheme = 'green';
    this.setTheme('green');
  }

  confirmCustomColor(): void {
    this.customColorModalOpen = false;
    this.appearanceMessage = 'Theme updated successfully';
    this.appearanceMessageType = 'success';
    setTimeout(() => (this.appearanceMessage = ''), 3000);
  }

  onCustomColorChange(color: string): void {
    this.customColor = color;
    if (!this.customColorModalOpen) return;
    const hex = color.startsWith('#') ? color : '#' + color;
    if (/^#[0-9a-fA-F]{6}$/.test(hex) || /^#[0-9a-fA-F]{3}$/.test(hex)) {
      this.themeService.setCustomColor(hex);
    }
  }

  // Cursor handling
  selectCursorSet(cursorSetId: string): void {
    this.previewCursorSetId = cursorSetId;
    this.cursorSetDropdownOpen = false;
  }

  confirmCursorSet(): void {
    this.cursor.select(this.previewCursorSetId);
    this.appearanceMessage = 'Cursor set applied successfully';
    this.appearanceMessageType = 'success';
    setTimeout(() => (this.appearanceMessage = ''), 3000);
  }
}


