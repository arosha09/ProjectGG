import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ChatService } from '../../services/chat.service';
import { UsersService } from '../../services/users.service';

interface GiftTrade {
  trade_id: number;
  trade_status: string;
  type: string;
  proposer_id: string;
  proposer_name: string;
  proposer_avatar: string | null;
  proposer_tier: string;
  proposer_game_code: string;
  proposer_cover: string | null;
  receiver_id: string;
  receiver_name: string;
  receiver_avatar: string | null;
  receiver_tier: string;
  receiver_game_code: string;
  receiver_cover: string | null;
  created_at: string;
}

@Component({
  selector: 'app-gift-tracking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="gifts-page">
      <div class="gifts-header">
        <p class="gifts-kicker">Arsenal</p>
        <h2 class="gifts-title">GIFT TRACKER</h2>
        <p class="gifts-subtitle">All sent and received card gifts.</p>
      </div>

      <div class="gifts-tabs">
        <button class="gift-tab" [class.active]="activeTab === 'all'" (click)="activeTab = 'all'">
          <mat-icon svgIcon="all_inclusive"></mat-icon> All
        </button>
        <button class="gift-tab" [class.active]="activeTab === 'sent'" (click)="activeTab = 'sent'">
          <mat-icon svgIcon="call_made"></mat-icon> Sent
          @if (sentGifts.length > 0) {
            <span class="tab-count">{{ sentGifts.length }}</span>
          }
        </button>
        <button class="gift-tab" [class.active]="activeTab === 'received'" (click)="activeTab = 'received'">
          <mat-icon svgIcon="call_received"></mat-icon> Received
          @if (receivedGifts.length > 0) {
            <span class="tab-count">{{ receivedGifts.length }}</span>
          }
        </button>
      </div>

      @if (loading) {
        <div class="gifts-loading">Loading gift history...</div>
      } @else if (filteredGifts.length === 0) {
        <div class="gifts-empty">
          <mat-icon class="empty-icon" svgIcon="card_giftcard"></mat-icon>
          <h3>No gifts {{ activeTab === 'sent' ? 'sent' : activeTab === 'received' ? 'received' : 'yet' }}</h3>
          <p>{{ activeTab === 'sent' ? 'Gifts you send to friends will appear here.' : activeTab === 'received' ? 'Gifts you receive from friends will appear here.' : 'Send or receive card gifts to see them tracked here.' }}</p>
        </div>
      } @else {
        <div class="gifts-list">
          @for (gift of filteredGifts; track gift.trade_id) {
            <div class="gift-card">
              <div class="gift-card-header">
                <div class="gift-user">
                  <img loading="lazy" decoding="async" [src]="gift.proposer_avatar || '/assets/avatars/unknown.webp'" alt="" class="gift-avatar" (error)="$event.target.style.display='none'" />
                  <div>
                    <div class="gift-user-name">{{ gift.proposer_id === currentUserId ? 'You' : gift.proposer_name }}</div>
                    <div class="gift-user-label">Gifter</div>
                  </div>
                </div>
                <div class="gift-arrow">
                  <mat-icon svgIcon="card_giftcard"></mat-icon>
                </div>
                <div class="gift-user">
                  <img loading="lazy" decoding="async" [src]="gift.receiver_avatar || '/assets/avatars/unknown.webp'" alt="" class="gift-avatar" (error)="$event.target.style.display='none'" />
                  <div>
                    <div class="gift-user-name">{{ gift.receiver_id === currentUserId ? 'You' : gift.receiver_name }}</div>
                    <div class="gift-user-label">Receiver</div>
                  </div>
                </div>
              </div>
              <div class="gift-card-body">
                <div class="gift-card-preview">
                  <img loading="lazy" decoding="async" [src]="gift.proposer_cover || ''" alt="" class="gift-card-img" (error)="$event.target.style.display='none'" />
                  <div class="gift-card-code">{{ gift.proposer_game_code }}</div>
                  <div class="gift-card-tier" [class]="'tier-' + gift.proposer_tier">{{ gift.proposer_tier }}</div>
                </div>
                <div class="gift-card-meta">
                  <span class="gift-date">{{ gift.created_at | date:'MMM d, y HH:mm' }}</span>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .gifts-page {
      display: flex; flex-direction: column; gap: 18px;
      padding: 24px 32px; width: 100%; min-width: 0; height: 100%;
      overflow-y: auto; background: var(--bg-card, #0d0d0d); box-sizing: border-box;
    }
    .gifts-header { margin-bottom: 4px; }
    .gifts-kicker { color: var(--text-muted); font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 4px; }
    .gifts-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0; }
    .gifts-subtitle { color: var(--text-muted); font-size: 13px; margin: 4px 0 0; }

    .gifts-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
    .gift-tab {
      display: flex; align-items: center; gap: 6px; padding: 8px 16px;
      border: 1px solid var(--border-color); border-radius: 8px; background: transparent;
      color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
      &:hover { border-color: rgba(var(--color-primary-r, 95), var(--color-primary-g, 182), var(--color-primary-b, 255), 0.5); color: var(--text-primary); }
      &.active { background: linear-gradient(135deg, var(--color-primary, #5fb6ff), var(--accent-color, #b36bff)); border-color: transparent; color: var(--bg-black, #04060d); }
      .tab-count { background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 10px; font-size: 11px; }
    }

    .gifts-loading, .gifts-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.4; }
    .gifts-empty h3 { font-size: 16px; color: var(--text-primary); margin: 0 0 6px; }
    .gifts-empty p { font-size: 13px; margin: 0; }

    .gifts-list { display: flex; flex-direction: column; gap: 12px; }
    .gift-card {
      border: 1px solid rgba(255, 215, 0, 0.2); border-radius: 12px;
      background: rgba(255, 215, 0, 0.03); padding: 16px; transition: border-color 0.2s;
      &:hover { border-color: rgba(255, 215, 0, 0.4); }
    }
    .gift-card-header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .gift-user { display: flex; align-items: center; gap: 8px; }
    .gift-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
    .gift-user-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .gift-user-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
    .gift-arrow { color: #ffd700; }
    .gift-card-body { display: flex; align-items: center; gap: 16px; }
    .gift-card-preview { display: flex; align-items: center; gap: 10px; }
    .gift-card-img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; background: var(--bg-surface, #151520); }
    .gift-card-code { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .gift-card-tier {
      padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
      &.tier-legendary { background: rgba(255, 215, 0, 0.15); color: #ffd700; }
      &.tier-epic { background: rgba(163, 53, 238, 0.15); color: #a335ee; }
      &.tier-rare { background: rgba(0, 112, 255, 0.15); color: #0070ff; }
      &.tier-uncommon { background: rgba(30, 200, 100, 0.15); color: #1ec864; }
      &.tier-common { background: rgba(150, 150, 150, 0.15); color: #999; }
    }
    .gift-card-meta { margin-left: auto; }
    .gift-date { font-size: 12px; color: var(--text-muted); }
  `],
})
export class GiftTrackingComponent implements OnInit {
  gifts: GiftTrade[] = [];
  loading = false;
  activeTab: 'all' | 'sent' | 'received' = 'all';
  currentUserId = '';

  constructor(
    private readonly chatService: ChatService,
    private readonly auth: UsersService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auth.currentUser$.subscribe(user => {
      this.currentUserId = user?.id || '';
    });
    this.loadGifts();
  }

  get sentGifts(): GiftTrade[] {
    return this.gifts.filter(g => g.proposer_id === this.currentUserId);
  }

  get receivedGifts(): GiftTrade[] {
    return this.gifts.filter(g => g.receiver_id === this.currentUserId);
  }

  get filteredGifts(): GiftTrade[] {
    if (this.activeTab === 'sent') return this.sentGifts;
    if (this.activeTab === 'received') return this.receivedGifts;
    return this.gifts;
  }

  private loadGifts(): void {
    this.loading = true;
    this.chatService.getCardTrades().subscribe({
      next: (trades) => {
        this.gifts = (trades || []).filter((t: any) => t.type === 'gift');
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}

