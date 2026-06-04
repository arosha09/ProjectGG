import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

type TradeTab = 'incoming' | 'outgoing' | 'completed';
type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

interface Trade {
  trade_id: number;
  trade_status: TradeStatus;
  proposer_id: string;
  proposer_name: string;
  proposer_avatar: string | null;
  proposer_card_id: number;
  proposer_game_code: string;
  proposer_cover: string | null;
  proposer_tier: string;
  receiver_id: string;
  receiver_name: string;
  receiver_avatar: string | null;
  receiver_card_id: number;
  receiver_game_code: string;
  receiver_cover: string | null;
  receiver_tier: string;
  created_at: string;
  resolved_at: string | null;
}

@Component({
  selector: 'app-card-trading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="trading-panel">
      <div class="trading-header">
        <div class="trading-tabs">
          <button 
            class="trading-tab" 
            [class.active]="activeTab === 'incoming'"
            (click)="activeTab = 'incoming'"
          >
            <mat-icon svgIcon="call_received"></mat-icon>
            Incoming
            @if (incomingCount > 0) {
              <span class="tab-badge">{{ incomingCount }}</span>
            }
          </button>
          <button 
            class="trading-tab" 
            [class.active]="activeTab === 'outgoing'"
            (click)="activeTab = 'outgoing'"
          >
            <mat-icon svgIcon="call_made"></mat-icon>
            Outgoing
            @if (outgoingCount > 0) {
              <span class="tab-badge">{{ outgoingCount }}</span>
            }
          </button>
          <button 
            class="trading-tab" 
            [class.active]="activeTab === 'completed'"
            (click)="activeTab = 'completed'"
          >
            <mat-icon svgIcon="check_circle"></mat-icon>
            Completed
          </button>
        </div>
      </div>

      <div class="trading-content">
        @if (filteredTrades.length === 0) {
          <div class="empty-state">
            @if (activeTab === 'incoming') {
              <mat-icon svgIcon="inbox"></mat-icon>
              <p>No incoming trades</p>
              <span>Trades from other users will appear here</span>
            } @else if (activeTab === 'outgoing') {
              <mat-icon svgIcon="outbox"></mat-icon>
              <p>No outgoing trades</p>
              <span>Trades you send will appear here</span>
            } @else {
              <mat-icon svgIcon="history"></mat-icon>
              <p>No completed trades</p>
              <span>Your trade history will appear here</span>
            }
          </div>
        } @else {
          @for (trade of filteredTrades; track trade.trade_id) {
            <div class="trade-card" [class]="'trade-' + trade.trade_status">
              <div class="trade-card-header">
                <div class="trade-status-badge" [class]="'status-' + trade.trade_status">
                  @if (trade.trade_status === 'pending') {
                    <mat-icon svgIcon="schedule"></mat-icon>
                    Pending
                  } @else if (trade.trade_status === 'accepted') {
                    <mat-icon svgIcon="check_circle"></mat-icon>
                    Accepted
                  } @else if (trade.trade_status === 'rejected') {
                    <mat-icon svgIcon="cancel"></mat-icon>
                    Rejected
                  } @else {
                    <mat-icon svgIcon="block"></mat-icon>
                    Cancelled
                  }
                </div>
                <span class="trade-time">{{ formatTime(trade.created_at) }}</span>
              </div>

              <div class="trade-parties">
                <div class="trade-user proposer">
                  @if (activeTab === 'outgoing') {
                    <span class="trade-user-label">You</span>
                  } @else {
                    <img loading="lazy" decoding="async" [src]="trade.proposer_avatar || defaultAvatar" alt="" class="trade-avatar" (error)="onAvatarError($event)" />
                    <span class="trade-name">{{ trade.proposer_name }}</span>
                  }
                </div>

                <div class="trade-arrow-wrapper">
                  <div class="trade-cards-preview">
                    <div class="trade-card-mini" [style.border-color]="tierColor(trade.proposer_tier)">
                      <img loading="lazy" decoding="async" [src]="trade.proposer_cover || defaultCover" alt="" class="trade-card-img" (error)="onImgError($event)" />
                    </div>
                    <mat-icon class="trade-arrow" svgIcon="swap_horiz"></mat-icon>
                    <div class="trade-card-mini" [style.border-color]="tierColor(trade.receiver_tier)">
                      <img loading="lazy" decoding="async" [src]="trade.receiver_cover || defaultCover" alt="" class="trade-card-img" (error)="onImgError($event)" />
                    </div>
                  </div>
                </div>

                <div class="trade-user receiver">
                  @if (activeTab === 'incoming' || activeTab === 'completed') {
                    <span class="trade-user-label">You</span>
                  } @else {
                    <img loading="lazy" decoding="async" [src]="trade.receiver_avatar || defaultAvatar" alt="" class="trade-avatar" (error)="onAvatarError($event)" />
                    <span class="trade-name">{{ trade.receiver_name }}</span>
                  }
                </div>
              </div>

              <div class="trade-card-details">
                <div class="trade-detail-item">
                  <span class="detail-label">Your card</span>
                  <div class="detail-card" [style.border-color]="tierColor(activeTab === 'outgoing' ? trade.proposer_tier : trade.receiver_tier)">
                    <img loading="lazy" decoding="async" [src]="(activeTab === 'outgoing' ? trade.proposer_cover : trade.receiver_cover) || defaultCover" alt="" (error)="onImgError($event)" />
                    <span class="detail-tier" [style.color]="tierColor(activeTab === 'outgoing' ? trade.proposer_tier : trade.receiver_tier)">
                      {{ activeTab === 'outgoing' ? trade.proposer_tier : trade.receiver_tier }}
                    </span>
                  </div>
                </div>
                <div class="trade-detail-arrow">
                  <mat-icon svgIcon="arrow_forward"></mat-icon>
                </div>
                <div class="trade-detail-item">
                  <span class="detail-label">
                    @if (activeTab === 'outgoing') { Their card } @else { Your card }
                  </span>
                  <div class="detail-card" [style.border-color]="tierColor(activeTab === 'outgoing' ? trade.receiver_tier : trade.proposer_tier)">
                    <img loading="lazy" decoding="async" [src]="(activeTab === 'outgoing' ? trade.receiver_cover : trade.proposer_cover) || defaultCover" alt="" (error)="onImgError($event)" />
                    <span class="detail-tier" [style.color]="tierColor(activeTab === 'outgoing' ? trade.receiver_tier : trade.proposer_tier)">
                      {{ activeTab === 'outgoing' ? trade.receiver_tier : trade.proposer_tier }}
                    </span>
                  </div>
                </div>
              </div>

              @if (trade.trade_status === 'pending') {
                <div class="trade-actions">
                  @if (activeTab === 'incoming') {
                    <button class="trade-btn accept" (click)="accept.emit(trade.trade_id)">
                      <mat-icon svgIcon="check"></mat-icon>
                      Accept Trade
                    </button>
                    <button class="trade-btn reject" (click)="reject.emit(trade.trade_id)">
                      <mat-icon svgIcon="close"></mat-icon>
                      Decline
                    </button>
                  } @else {
                    <span class="trade-pending-text">Awaiting response...</span>
                    <button class="trade-btn cancel" (click)="cancel.emit(trade.trade_id)">
                      <mat-icon svgIcon="cancel"></mat-icon>
                      Cancel
                    </button>
                  }
                </div>
              } @else if (trade.resolved_at) {
                <div class="trade-resolved">
                  <mat-icon svgIcon="schedule"></mat-icon>
                  {{ formatResolvedTime(trade.resolved_at) }}
                </div>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .trading-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .trading-header {
      border-bottom: 1px solid var(--border-subtle);
      padding: 0 16px;
    }

    .trading-tabs {
      display: flex;
      gap: 4px;
    }

    .trading-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 12px 16px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        color: var(--text-primary);
        background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.04);
      }

      &.active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
      }
    }

    .tab-badge {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--color-primary);
      color: #000;
      font-size: 10px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .trading-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .empty-state {
      text-align: center;
      color: var(--text-muted);
      padding: 48px 24px;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.3;
        margin-bottom: 12px;
      }

      p {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
      }

      span {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: var(--text-muted);
      }
    }

    .trade-card {
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      transition: border-color 0.15s ease;

      &:hover {
        border-color: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.4);
      }

      &.trade-accepted {
        border-left: 3px solid #00e676;
      }

      &.trade-rejected {
        border-left: 3px solid #ff1744;
        opacity: 0.7;
      }

      &.trade-cancelled {
        border-left: 3px solid #95a5a6;
        opacity: 0.7;
      }
    }

    .trade-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .trade-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      &.status-pending {
        background: rgba(241, 196, 15, 0.15);
        color: #f1c40f;
      }

      &.status-accepted {
        background: rgba(0, 230, 118, 0.15);
        color: #00e676;
      }

      &.status-rejected {
        background: rgba(255, 23, 68, 0.15);
        color: #ff1744;
      }

      &.status-cancelled {
        background: rgba(149, 165, 166, 0.15);
        color: #95a5a6;
      }
    }

    .trade-time {
      font-size: 11px;
      color: var(--text-muted);
    }

    .trade-parties {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .trade-user {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      min-width: 80px;

      &.proposer { align-items: flex-start; }
      &.receiver { align-items: flex-end; }
    }

    .trade-user-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-primary);
    }

    .trade-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid var(--border-color);
    }

    .trade-name {
      font-size: 11px;
      color: var(--text-secondary);
      text-align: center;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trade-arrow-wrapper {
      flex: 1;
      display: flex;
      justify-content: center;
    }

    .trade-cards-preview {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .trade-card-mini {
      width: 48px;
      height: 64px;
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid;
      background: var(--bg-black);
    }

    .trade-card-mini .trade-card-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .trade-arrow {
      color: var(--text-muted);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .trade-card-details {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-bottom: 16px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 8px;
    }

    .trade-detail-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .detail-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-card {
      width: 64px;
      height: 86px;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid;
      background: var(--bg-black);
      position: relative;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .detail-tier {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 2px;
      background: rgba(0, 0, 0, 0.8);
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
    }

    .trade-detail-arrow {
      color: var(--text-muted);

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .trade-actions {
      display: flex;
      justify-content: center;
      gap: 10px;
      padding-top: 12px;
      border-top: 1px solid var(--border-subtle);
    }

    .trade-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      font-family: inherit;
      transition: all 0.15s ease;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &.accept {
        background: #00e676;
        color: #000;

        &:hover {
          background: #00c853;
          transform: translateY(-1px);
        }
      }

      &.reject {
        background: rgba(255, 23, 68, 0.15);
        color: #ff1744;

        &:hover {
          background: rgba(255, 23, 68, 0.25);
        }
      }

      &.cancel {
        background: rgba(149, 165, 166, 0.15);
        color: #95a5a6;

        &:hover {
          background: rgba(149, 165, 166, 0.25);
        }
      }
    }

    .trade-pending-text {
      font-size: 12px;
      color: var(--text-muted);
      font-style: italic;
    }

    .trade-resolved {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding-top: 12px;
      border-top: 1px solid var(--border-subtle);
      font-size: 11px;
      color: var(--text-muted);

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }
  `],
})
export class CardTradingComponent {
  @Input() trades: Trade[] = [];
  @Input() currentUserId = '';
  @Output() accept = new EventEmitter<number>();
  @Output() reject = new EventEmitter<number>();
  @Output() cancel = new EventEmitter<number>();

  activeTab: TradeTab = 'incoming';
  defaultCover = '';
  defaultAvatar = '/assets/avatars/unknown.webp';

  readonly tierColors: Record<string, string> = {
    common: '#8c96a8',
    uncommon: '#00e676',
    rare: '#5fb6ff',
    epic: '#aa44ff',
    legendary: '#ffd700',
  };

  tierColor(tier: string): string {
    return this.tierColors[tier?.toLowerCase()] || '#8c96a8';
  }

  get filteredTrades(): Trade[] {
    return this.trades.filter(trade => {
      if (this.activeTab === 'incoming') {
        return trade.receiver_id === this.currentUserId && trade.trade_status === 'pending';
      } else if (this.activeTab === 'outgoing') {
        return trade.proposer_id === this.currentUserId && trade.trade_status === 'pending';
      } else {
        return trade.trade_status !== 'pending';
      }
    });
  }

  get incomingCount(): number {
    return this.trades.filter(t => t.receiver_id === this.currentUserId && t.trade_status === 'pending').length;
  }

  get outgoingCount(): number {
    return this.trades.filter(t => t.proposer_id === this.currentUserId && t.trade_status === 'pending').length;
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  formatResolvedTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `Resolved ${date.toLocaleDateString()}`;
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.defaultAvatar;
  }
}
