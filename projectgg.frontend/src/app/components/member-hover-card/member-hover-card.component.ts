import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GgServerMember } from '../../services/chat.service';

@Component({
  selector: 'app-member-hover-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (visible && member) {
      <div class="mhc-card" [style.left.px]="x" [style.top.px]="y" (mouseenter)="onEnter()" (mouseleave)="onLeave()">
        <!-- Banner -->
        @if (loading) {
          <div class="mhc-banner sk-banner"></div>
        } @else {
          <div class="mhc-banner" [style.background-image]="bannerUrl ? 'url(' + bannerUrl + ')' : ''" [style.background]="!bannerUrl ? getGradient() : ''">
          </div>
        }

        <!-- Avatar overlapping banner -->
        <div class="mhc-avatar-wrap">
          <div class="mhc-avatar" [class.sk-avatar]="loading">
            @if (loading) {
              <div class="sk-pulse"></div>
            } @else if (avatarUrl) {
              <img [src]="avatarUrl" alt="" />
            } @else {
              <span>{{ (member.username ?? member.user_id)[0] }}</span>
            }
          </div>
          @if (!loading) {
            <span class="mhc-status-dot"
              [class.online]="status === 'online'"
              [class.away]="status === 'away'"
              [class.dnd]="status === 'dnd'"
              [class.invisible]="status === 'invisible'"
            ></span>
          }
        </div>

        <!-- Body -->
        <div class="mhc-body">
          <div class="mhc-header">
            @if (loading) {
              <div class="sk-text sk-text-sm"></div>
            } @else {
              <span class="mhc-username">{{ member.username ?? member.user_id }}</span>
              @if (member.roles?.length) {
                <div class="mhc-roles">
                  @for (r of member.roles; track r) {
                    <span class="mhc-role-tag" [class.mhc-role-owner]="r === 'owner'" [class.mhc-role-admin]="r === 'admin'" [class.mhc-role-mod]="r === 'moderator'">{{ r }}</span>
                  }
                </div>
              }
            }
          </div>

          @if (!loading && about) {
            <div class="mhc-about">{{ about }}</div>
          }

          <div class="mhc-divider"></div>

          <!-- Action buttons -->
          @if (loading) {
            <div class="mhc-actions">
              <div class="sk-btn"></div>
              <div class="sk-btn"></div>
              <div class="sk-btn"></div>
            </div>
          } @else {
            <div class="mhc-actions">
              @if (isSelf) {
                <span class="mhc-self-label">This is you</span>
              } @else if (isFriend) {
                <button class="mhc-action-btn mhc-action-primary" (click)="openProfile.emit(member)">
                  <mat-icon svgIcon="person"></mat-icon> View Profile
                </button>
                @if (isInVoice) {
                  <button class="mhc-action-btn mhc-action-primary" (click)="inviteToVoice.emit(member)">
                    <mat-icon svgIcon="group_add"></mat-icon> Invite to Voice
                  </button>
                } @else {
                  <button class="mhc-action-btn" (click)="openCall.emit(member)">
                    <mat-icon svgIcon="call"></mat-icon> Call
                  </button>
                }
                <button class="mhc-action-btn" (click)="openTrade.emit(member)">
                  <mat-icon svgIcon="swap_horiz"></mat-icon> Trade
                </button>
                <button class="mhc-action-btn" (click)="openGift.emit(member)">
                  <mat-icon svgIcon="card_giftcard"></mat-icon> Gift
                </button>
              } @else {
                <button class="mhc-action-btn mhc-action-primary" (click)="addFriend.emit(member)">
                  <mat-icon svgIcon="person_add"></mat-icon> Add Friend
                </button>
                <button class="mhc-action-btn" (click)="openProfile.emit(member)">
                  <mat-icon svgIcon="person"></mat-icon> View Profile
                </button>
              }
            </div>
          }
        </div>

        <div class="mhc-corner mhc-corner-tl"></div>
        <div class="mhc-corner mhc-corner-tr"></div>
        <div class="mhc-corner mhc-corner-bl"></div>
        <div class="mhc-corner mhc-corner-br"></div>
      </div>
    }
  `,
  styles: [`
    :host {
      position: fixed;
      z-index: 10001;
      pointer-events: none;
    }
    :host(:has(.mhc-card)) {
      pointer-events: auto;
    }
    .mhc-card {
      position: fixed;
      z-index: 10001;
      width: 300px;
      background: #1a1a1e;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06);
      overflow: hidden;
      pointer-events: auto;
    }
    .mhc-banner {
      height: 60px;
      background-size: cover;
      background-position: center;
      position: relative;
    }
    .mhc-avatar-wrap {
      position: relative;
      margin-top: -28px;
      padding-left: 16px;
    }
    .mhc-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 4px solid #1a1a1e;
      background: #2a2a2e;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      img { width: 100%; height: 100%; object-fit: cover; }
      span { font-size: 22px; font-weight: 800; color: #ffaa00; }
    }
    .mhc-status-dot {
      position: absolute;
      bottom: 2px;
      left: 56px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 3px solid #1a1a1e;
      background: #555;
    }
    .mhc-status-dot.online { background: #23a55a; }
    .mhc-status-dot.away { background: #f0b232; }
    .mhc-status-dot.dnd { background: #f23f43; }
    .mhc-status-dot.invisible { background: #80848e; }
    .mhc-body {
      padding: 8px 16px 16px;
    }
    .mhc-header {
      padding-top: 4px;
    }
    .mhc-username {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      display: block;
    }
    .mhc-roles {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .mhc-role-tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: capitalize;
      background: rgba(255, 255, 255, 0.08);
      color: #b5bac1;
    }
    .mhc-role-owner {
      background: rgba(255, 170, 0, 0.15);
      color: #ffaa00;
    }
    .mhc-role-admin {
      background: rgba(255, 60, 60, 0.15);
      color: #ff5555;
    }
    .mhc-role-mod {
      background: rgba(88, 166, 255, 0.15);
      color: #58a6ff;
    }
    .mhc-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
      margin: 12px 0;
    }
    .mhc-about {
      margin-top: 10px;
      font-size: 13px;
      line-height: 1.45;
      color: #dbdee1;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .mhc-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mhc-action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      color: #b5bac1;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
    }
    .mhc-action-primary {
      background: rgba(88, 166, 255, 0.12);
      color: #58a6ff;
      &:hover {
        background: rgba(88, 166, 255, 0.2);
        color: #79b8ff;
      }
    }
    .mhc-self-label {
      font-size: 12px;
      color: #555;
      font-style: italic;
      padding: 4px 0;
    }

    .sk-banner {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      animation: skShimmer 1.5s ease-in-out infinite;
    }

    .sk-avatar {
      background: #2a2a2e;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sk-pulse {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2a2a2e, #3a3a3e, #2a2a2e);
      animation: skPulse 1.2s ease-in-out infinite;
    }

    .sk-text {
      height: 14px;
      border-radius: 4px;
      background: #2a2a2e;
      animation: skShimmer 1.5s ease-in-out infinite;
    }

    .sk-text-sm {
      width: 60%;
      height: 14px;
    }

    .sk-btn {
      height: 32px;
      border-radius: 4px;
      background: #2a2a2e;
      flex: 1;
      animation: skShimmer 1.5s ease-in-out infinite;
    }

    @keyframes skShimmer {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.7; }
    }

    @keyframes skPulse {
      0%, 100% { transform: scale(0.92); opacity: 0.4; }
      50% { transform: scale(1); opacity: 0.7; }
    }
  `],
})
export class MemberHoverCardComponent implements OnDestroy {
  @Input() member: GgServerMember | any = null;
  @Input() set avatarUrl(val: string | null) {
    if (val !== this._avatarUrl) {
      this._avatarUrl = val;
      this.extractedColors = [];
      if (val) this.extractColorsFromAvatar(val);
    }
  }
  get avatarUrl(): string | null { return this._avatarUrl; }
  private _avatarUrl: string | null = null;
  @Input() bannerUrl: string | null = null;
  @Input() status: string = 'offline';
  @Input() isFriend = false;
  @Input() isSelf = false;
  @Input() about: string | null = null;
  @Input() isInVoice = false;
  @Input() loading = false;

  private extractedColors: string[] = [];

  @Output() addFriend = new EventEmitter<any>();
  @Output() openProfile = new EventEmitter<any>();
  @Output() openTrade = new EventEmitter<any>();
  @Output() openGift = new EventEmitter<any>();
  @Output() openCall = new EventEmitter<any>();
  @Output() inviteToVoice = new EventEmitter<any>();

  visible = false;
  x = 0;
  y = 0;
  private showTimer: any;
  private hideTimer: any;

  constructor(private cdr: ChangeDetectorRef) {}

  show(event: MouseEvent, member: any, position: 'panel' | 'spot' = 'spot'): void {
    clearTimeout(this.hideTimer);
    this.member = member;
    const cardWidth = 300;
    const cardHeight = 320;
    const gap = 8;
    const serverListWidth = 72;
    const channelListWidth = 240;
    const panelWidth = 200;
    const minX = serverListWidth + channelListWidth + gap;
    const maxX = window.innerWidth - panelWidth - gap;
    const maxY = window.innerHeight - cardHeight - gap;

    if (position === 'panel') {
      this.x = maxX - cardWidth;
    } else {
      this.x = event.clientX - cardWidth - 12;
      if (this.x < minX) this.x = event.clientX + 12;
    }
    if (this.x < minX) this.x = minX;
    if (this.x + cardWidth > maxX) this.x = maxX - cardWidth;

    this.y = Math.max(gap, Math.min(event.clientY - 40, maxY));

    this.showTimer = setTimeout(() => {
      this.visible = true;
      this.cdr.markForCheck();
    }, 400);
  }

  hide(): void {
    clearTimeout(this.showTimer);
    this.hideTimer = setTimeout(() => {
      this.visible = false;
      this.cdr.markForCheck();
    }, 200);
  }

  onEnter(): void {
    clearTimeout(this.hideTimer);
  }

  onLeave(): void {
    this.hide();
  }

  getGradient(): string {
    if (this.extractedColors.length >= 2) {
      return `linear-gradient(135deg, ${this.extractedColors[0]}, ${this.extractedColors[1]})`;
    }
    const name = this.member?.username ?? 'user';
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      'linear-gradient(135deg, #ff6a00 0%, #ee0979 100%)',
      'linear-gradient(135deg, #00c6fb 0%, #005bea 100%)',
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return gradients[Math.abs(hash) % gradients.length];
  }

  private extractColorsFromAvatar(url: string): void {
    if (url.includes('/assets/avatars/')) {
      if (url.includes('male')) {
        this.extractedColors = ['#1a1a1a', '#e0e0e0'];
      } else if (url.includes('female')) {
        this.extractedColors = ['#1a1a1a', '#e0e0e0'];
      } else {
        this.extractedColors = ['#606060', '#b0b0b0'];
      }
      this.cdr.markForCheck();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
        this.extractedColors = [toColor(sorted[0][0]), toColor(sorted[1][0])];
        this.cdr.markForCheck();
      } catch {}
    };
    img.src = url;
  }

  ngOnDestroy(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
  }
}
