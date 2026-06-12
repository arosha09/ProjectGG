import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-user-profile-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="upc-card" [class.upc-compact]="compact">
      <div class="upc-banner"
        [style.background]="bannerUrl ? 'url(' + bannerUrl + ') center/cover no-repeat' : 'var(--bg-card)'">
        @if (!bannerUrl) {
          <div class="upc-banner-placeholder">
            <mat-icon svgIcon="image"></mat-icon>
          </div>
        }
      </div>

      <div class="upc-header">
        <div class="upc-avatar-wrap">
          <div class="upc-avatar">
            @if (avatarUrl) {
              <img [src]="avatarUrl" [alt]="username" />
            } @else {
              <span>{{ (username || '?')[0] | uppercase }}</span>
            }
          </div>
          @if (status) {
            <span class="upc-status-dot"
              [class.online]="status === 'online'"
              [class.away]="status === 'away'"
              [class.dnd]="status === 'dnd'"
              [class.invisible]="status === 'invisible'"></span>
          }
        </div>
        <div class="upc-name-block">
          <span class="upc-display-name">{{ displayName || username || 'Unknown' }}</span>
          @if (displayName && username && displayName !== username) {
            <span class="upc-username">&#64;{{ username }}</span>
          }
          @if (status) {
            <span class="upc-status-text">{{ status }}</span>
          }
        </div>
      </div>

      @if (about) {
        <div class="upc-section upc-about">
          <div class="upc-section-head">
            <mat-icon svgIcon="info"></mat-icon>
            <span>About</span>
          </div>
          <p class="upc-about-text">{{ about }}</p>
        </div>
      }

      @if (connections && connections.length > 0) {
        <div class="upc-section upc-connections">
          <div class="upc-section-head">
            <mat-icon svgIcon="link"></mat-icon>
            <span>Connected Accounts</span>
          </div>
          <div class="upc-conn-grid">
            @for (conn of connections; track conn.platform) {
              <div class="upc-conn-row">
                <img [src]="getPlatformLogo(conn.platform)" [alt]="conn.platform" class="upc-conn-logo" />
                <div class="upc-conn-info">
                  <span class="upc-conn-name">{{ formatPlatformName(conn.platform) }}</span>
                  <span class="upc-conn-user">{{ conn.platform_username || conn.platform_user_id || 'Connected' }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .upc-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }
    .upc-banner {
      width: 100%;
      height: 120px;
      background-size: cover;
      background-position: center;
      position: relative;
    }
    .upc-compact .upc-banner {
      height: 80px;
    }
    .upc-banner-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      opacity: 0.4;
      mat-icon {
        width: 32px;
        height: 32px;
        font-size: 32px;
      }
    }
    .upc-header {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      padding: 0 16px;
      margin-top: -32px;
    }
    .upc-avatar-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .upc-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: 4px solid var(--bg-panel);
      background: var(--bg-card);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      img { width: 100%; height: 100%; object-fit: cover; }
      span {
        font-size: 24px;
        font-weight: 800;
        color: var(--color-primary);
      }
    }
    .upc-compact .upc-avatar {
      width: 48px;
      height: 48px;
      border-width: 3px;
      span { font-size: 18px; }
    }
    .upc-status-dot {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 3px solid var(--bg-panel);
      background: #555;
    }
    .upc-status-dot.online { background: #23a55a; }
    .upc-status-dot.away { background: #f0b232; }
    .upc-status-dot.dnd { background: #f23f43; }
    .upc-status-dot.invisible { background: #80848e; }
    .upc-name-block {
      flex: 1;
      min-width: 0;
      padding-bottom: 8px;
    }
    .upc-display-name {
      display: block;
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    .upc-username {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 1px;
    }
    .upc-status-text {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    .upc-section {
      padding: 14px 16px;
      border-top: 1px solid var(--border-color);
    }
    .upc-compact .upc-section {
      padding: 10px 14px;
    }
    .upc-section-head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      mat-icon {
        width: 14px;
        height: 14px;
        font-size: 14px;
      }
    }
    .upc-about-text {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .upc-compact .upc-about-text {
      font-size: 12px;
    }
    .upc-conn-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .upc-conn-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .upc-conn-logo {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: var(--bg-card);
      object-fit: contain;
      flex-shrink: 0;
    }
    .upc-conn-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .upc-conn-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .upc-conn-user {
      font-size: 11px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class UserProfileCardComponent {
  @Input() displayName: string | null = null;
  @Input() username: string | null = null;
  @Input() avatarUrl: string | null = null;
  @Input() bannerUrl: string | null = null;
  @Input() about: string | null = null;
  @Input() status: string = '';
  @Input() connections: Array<{ platform: string; platform_username?: string | null; platform_user_id?: string | null }> = [];
  @Input() compact = false;

  getPlatformLogo(platform: string): string {
    return `assets/platforms/${platform}.svg`;
  }

  formatPlatformName(platform: string): string {
    const names: Record<string, string> = {
      steam: 'Steam',
      discord: 'Discord',
      gog: 'GOG',
      epic: 'Epic Games',
      ubisoft: 'Ubisoft',
      ea: 'EA App',
      spotify: 'Spotify',
      youtube_music: 'YouTube Music',
      apple_music: 'Apple Music',
    };
    return names[platform] || platform;
  }
}
