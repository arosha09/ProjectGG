import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-server-profile-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    @if (visible) {
      <div class="spe-overlay" (click)="onOverlayClick($event)">
        <div class="spe-modal" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="spe-header">
            <div class="spe-header-text">
              <h2>Server Profile</h2>
              <p class="spe-muted">Customize how you appear in <strong>{{ serverName }}</strong>. These settings only apply here.</p>
            </div>
          </div>

          <!-- Hero: Banner + Avatar -->
          <div class="spe-hero">
            <div class="spe-banner-wrap">
              <button type="button" class="spe-banner"
                [style.background]="effectiveBanner() ? 'url(' + effectiveBanner() + ') center/cover no-repeat' : 'var(--bg-card)'"
                (click)="bannerFileInput.click()">
                <div class="spe-edit-hover">
                  <mat-icon svgIcon="edit"></mat-icon>
                  <span>Edit Banner</span>
                </div>
                <div class="spe-banner-actions">
                  @if (profile?.banner_url) {
                    <span class="spe-remove-btn" title="Remove Banner" (click)="onRemoveBanner($event)">
                      <mat-icon svgIcon="delete"></mat-icon>
                    </span>
                  }
                  <button class="spe-banner-action" (click)="close.emit(); $event.stopPropagation()" title="Close">
                    <mat-icon svgIcon="close"></mat-icon>
                  </button>
                </div>
              </button>
              <input #bannerFileInput type="file" accept="image/*" hidden (change)="onBannerSelect($event)" />

              <div class="spe-avatar-row">
                <div class="spe-avatar-wrap">
                  <button type="button" class="spe-avatar" (click)="avatarFileInput.click()">
                    @if (effectiveAvatar()) {
                      <img [src]="effectiveAvatar()" alt="Avatar" />
                    } @else {
                      <mat-icon svgIcon="person"></mat-icon>
                    }
                    <div class="spe-edit-hover spe-edit-hover-sm">
                      <mat-icon svgIcon="edit"></mat-icon>
                    </div>
                  </button>
                  <input #avatarFileInput type="file" accept="image/*" hidden (change)="onAvatarSelect($event)" />
                  @if (profile?.avatar_url) {
                    <button class="spe-avatar-remove" title="Remove Avatar" (click)="onRemoveAvatar($event)">
                      <mat-icon svgIcon="close"></mat-icon>
                    </button>
                  }
                </div>
                <div class="spe-hero-text">
                  <p class="spe-eyebrow">Server Identity</p>
                  <h3>{{ mainProfile?.name || mainProfile?.username || 'You' }}</h3>
                  @if (mainProfile?.username && mainProfile?.name && mainProfile.name !== mainProfile.username) {
                    <span class="spe-handle">&#64;{{ mainProfile.username }}</span>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="spe-body">
            <!-- About -->
            <section class="spe-card">
              <div class="spe-card-head">
                <mat-icon svgIcon="info"></mat-icon>
                <h3>About</h3>
                <label class="spe-toggle" [class.on]="profile?.show_about" (click)="toggleShowAbout()">
                  <span class="spe-toggle-knob"></span>
                </label>
              </div>
              <div class="spe-card-body">
                <textarea
                  class="spe-about-input"
                  [(ngModel)]="about"
                  (blur)="saveAbout()"
                  placeholder="Tell others about yourself in this server..."
                  rows="3"
                  maxlength="500"></textarea>
                <div class="spe-about-meta">
                  <span class="spe-about-hint">Visible in your server profile preview</span>
                  <span class="spe-about-count">{{ about.length || 0 }}/500</span>
                </div>
              </div>
            </section>

            <!-- Connected Accounts -->
            <section class="spe-card">
              <div class="spe-card-head">
                <mat-icon svgIcon="link"></mat-icon>
                <h3>Connected Accounts</h3>
                <label class="spe-toggle" [class.on]="profile?.show_connections" (click)="toggleShowConnections()">
                  <span class="spe-toggle-knob"></span>
                </label>
              </div>
              <div class="spe-card-body">
                <p class="spe-muted-inline">Platforms linked to your main account. Toggle each one to show or hide in this server.</p>
                @for (p of platforms; track p.id) {
                  <div class="spe-platform-row">
                    <img class="spe-platform-logo" [src]="getPlatformLogo(p.id)" alt="{{ p.name }}" />
                    <div class="spe-platform-info">
                      <span class="spe-platform-name">{{ p.name }}</span>
                      @if (getConnection(p.id); as conn) {
                        <span class="spe-platform-user">{{ conn.platform_username || conn.platform_user_id || 'Connected' }}</span>
                      } @else {
                        <span class="spe-platform-user not-linked">Not linked</span>
                      }
                    </div>
                    <label class="spe-toggle spe-toggle-sm" [class.on]="isPlatformVisible(p.id)" [class.disabled]="!profile?.show_connections" (click)="togglePlatformVisible(p.id)">
                      <span class="spe-toggle-knob"></span>
                    </label>
                  </div>
                }
              </div>
            </section>

            <!-- Showcase -->
            <section class="spe-card">
              <div class="spe-card-head">
                <mat-icon svgIcon="style"></mat-icon>
                <h3>Showcase</h3>
                <label class="spe-toggle" [class.on]="profile?.show_favorites" (click)="toggleShowFavorites()">
                  <span class="spe-toggle-knob"></span>
                </label>
              </div>
              <div class="spe-card-body">
                <p class="spe-muted-inline">Display your favorite card collection on your server profile.</p>
              </div>
            </section>

            <!-- Rank -->
            <section class="spe-card">
              <div class="spe-card-head">
                <mat-icon svgIcon="military_tech"></mat-icon>
                <h3>Rank</h3>
                <label class="spe-toggle" [class.on]="profile?.show_rank" (click)="toggleShowRank()">
                  <span class="spe-toggle-knob"></span>
                </label>
              </div>
              <div class="spe-card-body">
                <p class="spe-muted-inline">Show your rank and XP progress on your server profile.</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .spe-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-y: auto;
    }
    .spe-modal {
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      width: 100%;
      max-width: 720px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    }
    .spe-header {
      padding: 20px 24px 16px;
      position: relative;
    }
    .spe-header-text {
      padding-right: 40px;
    }
    .spe-header h2 {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 800;
      color: var(--text-primary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .spe-header .spe-muted {
      margin: 0;
      font-size: 13px;
      color: var(--text-muted);
    }
    .spe-banner-actions {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      z-index: 3;
    }
    .spe-banner-action {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #fff;
      transition: background 0.15s;
      mat-icon { width: 16px; height: 16px; font-size: 16px; }
      &:hover {
        background: rgba(0, 0, 0, 0.85);
      }
    }
    .spe-hero {
      position: relative;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
    }
    .spe-banner-wrap {
      position: relative;
    }
    .spe-banner {
      display: block;
      width: 100%;
      height: 160px;
      border: none;
      background-color: var(--bg-card);
      background-size: cover;
      background-position: center;
      position: relative;
      cursor: pointer;
      padding: 0;
      transition: filter 0.2s;
      &:hover {
        filter: brightness(0.8);
        .spe-edit-hover {
          opacity: 1;
        }
      }
    }
    .spe-edit-hover {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0;
      transition: opacity 0.2s;
      mat-icon { width: 18px; height: 18px; font-size: 18px; }
    }
    .spe-edit-hover-sm {
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 50%;
    }
    .spe-remove-btn {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(216, 58, 58, 0.85);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #fff;
      transition: background 0.15s;
      mat-icon { width: 16px; height: 16px; font-size: 16px; }
      &:hover {
        background: rgba(216, 58, 58, 1);
      }
    }
    .spe-avatar-row {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      padding: 0 24px 16px;
      margin-top: -44px;
      position: relative;
    }
    .spe-avatar-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .spe-avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      border: 4px solid var(--bg-panel);
      background: var(--bg-card);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 0;
      cursor: pointer;
      position: relative;
      transition: filter 0.2s;
      img { width: 100%; height: 100%; object-fit: cover; }
      mat-icon { width: 36px; height: 36px; font-size: 36px; color: var(--text-muted); }
      &:hover {
        filter: brightness(0.85);
        .spe-edit-hover { opacity: 1; }
      }
    }
    .spe-avatar-remove {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #d83a3a;
      border: 2px solid var(--bg-panel);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #fff;
      mat-icon { width: 14px; height: 14px; font-size: 14px; }
    }
    .spe-hero-text {
      flex: 1;
      min-width: 0;
      padding-bottom: 8px;
    }
    .spe-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-primary, #5fb6ff);
      margin: 0 0 4px;
    }
    .spe-hero-text h3 {
      font-size: 20px;
      font-weight: 800;
      color: var(--text-primary);
      margin: 0;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    .spe-handle {
      display: block;
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .spe-body {
      padding: 20px 24px 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .spe-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }
    .spe-card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.02);
      mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
        color: var(--color-primary, #5fb6ff);
      }
      h3 {
        flex: 1;
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        color: var(--text-primary);
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
    }
    .spe-card-body {
      padding: 14px 16px;
    }
    .spe-muted-inline {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0 0 12px;
    }
    .spe-about-input {
      width: 100%;
      min-height: 72px;
      padding: 10px 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 14px;
      line-height: 1.4;
      resize: vertical;
      box-sizing: border-box;
      &:focus {
        outline: none;
        border-color: var(--color-primary, #5fb6ff);
      }
    }
    .spe-about-meta {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .spe-platform-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border-color);
      &:last-child { border-bottom: none; }
    }
    .spe-platform-logo {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: var(--bg-card);
      object-fit: contain;
    }
    .spe-platform-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .spe-platform-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .spe-platform-user {
      font-size: 12px;
      color: var(--text-muted);
      &.not-linked { font-style: italic; opacity: 0.6; }
    }
    .spe-toggle {
      display: inline-block;
      position: relative;
      width: 36px;
      height: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      &.on { background: var(--color-primary, #5fb6ff); border-color: var(--color-primary, #5fb6ff); }
      &.disabled { opacity: 0.35; pointer-events: none; }
    }
    .spe-toggle-knob {
      position: absolute;
      top: 1px;
      left: 1px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s;
    }
    .spe-toggle.on .spe-toggle-knob { transform: translateX(16px); }
    .spe-toggle-sm { width: 28px; height: 16px; }
    .spe-toggle-sm .spe-toggle-knob { width: 12px; height: 12px; }
    .spe-toggle-sm.on .spe-toggle-knob { transform: translateX(12px); }
  `],
})
export class ServerProfileEditorComponent implements OnInit, OnDestroy {
  @Input() visible = false;
  @Input() serverId!: number;
  @Input() serverName = '';
  @Output() close = new EventEmitter<void>();

  profile: any = null;
  about = '';
  mainProfile: any = null;
  connections: any[] = [];
  platformVisibility: Record<string, boolean> = {};
  saving = false;

  readonly platforms = [
    { id: 'steam', name: 'Steam' },
    { id: 'discord', name: 'Discord' },
    { id: 'gog', name: 'GOG' },
    { id: 'epic', name: 'Epic Games' },
    { id: 'ubisoft', name: 'Ubisoft' },
    { id: 'ea', name: 'EA App' },
    { id: 'spotify', name: 'Spotify' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private usersService: UsersService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(): void {
    if (this.visible) this.loadAll();
  }

  private loadAll(): void {
    const userId = this.auth.getCurrentUser()?.id;
    if (!userId || !this.serverId) return;
    // Load main profile for pre-population
    this.usersService.getUserDetails(String(userId)).subscribe({
      next: (m) => { this.mainProfile = m; this.cdr.markForCheck(); },
      error: () => {},
    });
    // Load server profile
    this.chatService.getServerProfile(this.serverId, String(userId)).subscribe({
      next: (p) => {
        this.profile = {
          avatar_url: p?.avatar_url ?? null,
          banner_url: p?.banner_url ?? null,
          about: p?.about ?? '',
          show_about: p?.show_about ?? true,
          show_connections: p?.show_connections ?? true,
          show_favorites: p?.show_favorites ?? true,
          show_rank: p?.show_rank ?? true,
        };
        this.about = this.profile.about ?? '';
        this.platformVisibility = p?.show_connection_platforms ?? {};
        this.cdr.markForCheck();
      },
      error: () => {
        this.profile = { avatar_url: null, banner_url: null, about: '', show_about: true, show_connections: true, show_favorites: true, show_rank: true };
        this.about = '';
        this.platformVisibility = {};
        this.cdr.markForCheck();
      },
    });
    // Load connections
    this.chatService.getConnections(String(userId)).subscribe({
      next: (c) => { this.connections = c ?? []; this.cdr.markForCheck(); },
      error: () => { this.connections = []; },
    });
  }

  // Effective values fall back to main profile until changed
  effectiveBanner(): string | null {
    return this.profile?.banner_url || this.mainProfile?.banner_url || null;
  }
  effectiveAvatar(): string | null {
    return this.profile?.avatar_url || this.mainProfile?.avatar || null;
  }

  onOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close.emit();
  }

  getPlatformLogo(id: string): string {
    return `assets/platforms/${id}.svg`;
  }

  getConnection(platformId: string): any {
    return this.connections.find(c => c.platform === platformId);
  }

  isPlatformVisible(platformId: string): boolean {
    return this.platformVisibility[platformId] !== false;
  }

  onBannerSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.chatService.uploadServerProfileBanner(this.serverId, file).subscribe({
      next: (res) => {
        this.profile = { ...this.profile, banner_url: res.url };
        this.cdr.markForCheck();
      },
    });
  }

  onAvatarSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.chatService.uploadServerProfileAvatar(this.serverId, file).subscribe({
      next: (res) => {
        this.profile = { ...this.profile, avatar_url: res.url };
        this.cdr.markForCheck();
      },
    });
  }

  onRemoveBanner(e: MouseEvent): void {
    e.stopPropagation();
    this.chatService.deleteServerProfileBanner(this.serverId).subscribe(() => {
      this.profile = { ...this.profile, banner_url: null };
      this.cdr.markForCheck();
    });
  }

  onRemoveAvatar(e: MouseEvent): void {
    e.stopPropagation();
    this.chatService.deleteServerProfileAvatar(this.serverId).subscribe(() => {
      this.profile = { ...this.profile, avatar_url: null };
      this.cdr.markForCheck();
    });
  }

  saveAbout(): void {
    if (this.saving) return;
    this.saving = true;
    this.chatService.updateServerProfile(this.serverId, { about: this.about }).subscribe({
      next: () => { this.saving = false; this.cdr.markForCheck(); },
      error: () => { this.saving = false; this.cdr.markForCheck(); },
    });
  }

  toggleShowAbout(): void {
    const next = !this.profile?.show_about;
    this.profile = { ...this.profile, show_about: next };
    this.chatService.updateServerProfile(this.serverId, { show_about: next }).subscribe();
  }

  toggleShowConnections(): void {
    const next = !this.profile?.show_connections;
    this.profile = { ...this.profile, show_connections: next };
    this.chatService.updateServerProfile(this.serverId, { show_connections: next }).subscribe();
  }

  toggleShowFavorites(): void {
    const next = !this.profile?.show_favorites;
    this.profile = { ...this.profile, show_favorites: next };
    this.chatService.updateServerProfile(this.serverId, { show_favorites: next }).subscribe();
  }

  toggleShowRank(): void {
    const next = !this.profile?.show_rank;
    this.profile = { ...this.profile, show_rank: next };
    this.chatService.updateServerProfile(this.serverId, { show_rank: next }).subscribe();
  }

  togglePlatformVisible(platformId: string): void {
    this.platformVisibility = { ...this.platformVisibility, [platformId]: !this.isPlatformVisible(platformId) };
    this.chatService.updateServerProfile(this.serverId, { show_connection_platforms: this.platformVisibility }).subscribe();
  }
}
