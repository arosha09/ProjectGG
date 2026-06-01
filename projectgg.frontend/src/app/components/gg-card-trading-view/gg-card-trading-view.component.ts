import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';
import { ChatService, FriendUser } from '../../services/chat.service';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

type TradeTab = 'incoming' | 'outgoing' | 'completed' | 'propose' | 'gift' | 'gifts';

interface Trade {
  trade_id: number;
  trade_status: string;
  type: string;
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
  allow_unfair?: boolean;
  created_at: string;
  resolved_at: string | null;
}

interface UserCard {
  id: number;
  game_code: string;
  game_name: string;
  cover_url: string | null;
  card_tier: string;
  is_favorite: boolean;
}

@Component({
  selector: 'app-gg-card-trading-view',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
  templateUrl: './gg-card-trading-view.component.html',
  styleUrls: ['./gg-card-trading-view.component.scss'],
})
export class GgCardTradingViewComponent implements OnInit {
  @Input() currentUserId = '';
  @Input() friends: FriendUser[] = [];
  @Input() filterUserId = '';
  @Input() startOnGiftTab = false;
  @Output() accepted = new EventEmitter<number>();
  @Output() rejected = new EventEmitter<number>();
  @Output() cancelled = new EventEmitter<number>();

  activeTab: TradeTab = 'incoming';
  trades: Trade[] = [];
  loading = false;
  error: string | null = null;

  // Propose trade
  proposerCards: UserCard[] = [];
  loadingProposerCards = false;
  selectedProposerCard: UserCard | null = null;
  selectedReceiverId = '';
  receiverCards: UserCard[] = [];
  loadingReceiverCards = false;
  selectedReceiverCard: UserCard | null = null;
  fairness: { isFair: boolean; tierDiff: number; proposerTier: string; receiverTier: string } | null = null;
  allowUnfair = false;
  proposing = false;

  // Gift
  giftCard: UserCard | null = null;
  giftReceiverId = '';
  gifting = false;

  // Search & Sort
  tradeSearch = '';
  tradeSort: 'newest' | 'oldest' | 'name' = 'newest';

  // User search (for non-friends)
  userSearch = '';
  userSearchResults: any[] = [];
  searching = false;

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (this.startOnGiftTab) {
      this.activeTab = 'gift';
    }
    this.loadTrades();
  }

  loadTrades(): void {
    this.loading = true;
    this.error = null;
    this.chat.getCardTrades(this.filterUserId || undefined).subscribe({
      next: (trades) => {
        this.trades = trades || [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Unknown error';
        this.error = `Failed to load trades: ${msg}`;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private filterAndSort(trades: Trade[]): Trade[] {
    let result = trades;
    if (this.tradeSearch.trim()) {
      const q = this.tradeSearch.toLowerCase();
      result = result.filter(t =>
        (t.proposer_name || '').toLowerCase().includes(q) ||
        (t.receiver_name || '').toLowerCase().includes(q) ||
        (t.proposer_game_code || '').toLowerCase().includes(q) ||
        (t.receiver_game_code || '').toLowerCase().includes(q)
      );
    }
    if (this.tradeSort === 'newest') {
      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (this.tradeSort === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (this.tradeSort === 'name') {
      result = [...result].sort((a, b) => (a.proposer_name || '').localeCompare(b.proposer_name || ''));
    }
    return result;
  }

  get incomingTrades(): Trade[] {
    return this.filterAndSort(this.trades.filter(t => t.trade_status === 'pending' && t.receiver_id === this.currentUserId && (t.type || 'trade') === 'trade'));
  }

  get outgoingTrades(): Trade[] {
    return this.filterAndSort(this.trades.filter(t => t.trade_status === 'pending' && t.proposer_id === this.currentUserId && (t.type || 'trade') === 'trade'));
  }

  get completedTrades(): Trade[] {
    return this.filterAndSort(this.trades.filter(t => (t.trade_status === 'accepted' || t.trade_status === 'rejected' || t.trade_status === 'cancelled') && (t.type || 'trade') === 'trade'));
  }

  get giftHistory(): Trade[] {
    return this.filterAndSort(this.trades.filter(t => t.type === 'gift' && (t.proposer_id === this.currentUserId || t.receiver_id === this.currentUserId)));
  }

  get sentGifts(): Trade[] {
    return this.giftHistory.filter(t => t.proposer_id === this.currentUserId);
  }

  get receivedGifts(): Trade[] {
    return this.giftHistory.filter(t => t.receiver_id === this.currentUserId);
  }

  get incomingCount(): number {
    return this.incomingTrades.length;
  }

  accept(tradeId: number): void {
    this.chat.acceptCardTrade(tradeId).subscribe({
      next: () => { this.loadTrades(); this.cdr.markForCheck(); },
    });
  }

  reject(tradeId: number): void {
    this.chat.rejectCardTrade(tradeId).subscribe({
      next: () => { this.loadTrades(); this.cdr.markForCheck(); },
    });
  }

  cancel(tradeId: number): void {
    this.chat.cancelCardTrade(tradeId).subscribe({
      next: () => { this.loadTrades(); this.cdr.markForCheck(); },
    });
  }

  switchTab(tab: TradeTab): void {
    this.activeTab = tab;
    if (tab === 'propose' && this.proposerCards.length === 0) {
      this.loadProposerCards();
    } else if (tab === 'gift' && this.proposerCards.length === 0) {
      this.loadProposerCards();
    }
  }

  // ── Propose trade ──

  loadProposerCards(): void {
    this.loadingProposerCards = true;
    this.chat.getCardCollection(1, 100).subscribe({
      next: (cards) => {
        this.proposerCards = (cards || []).map(c => ({
          id: c.id ?? c.user_card_id,
          game_code: c.game_code,
          game_name: c.game_name ?? c.name,
          cover_url: c.cover_url,
          card_tier: c.card_tier ?? 'common',
          is_favorite: c.is_favorite ?? false,
        }));
        this.loadingProposerCards = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingProposerCards = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectProposerCard(card: UserCard): void {
    this.selectedProposerCard = card;
    this.checkFairness();
  }

  selectReceiverFriend(friend: FriendUser): void {
    this.selectedReceiverId = friend.other_id;
    this.loadReceiverCards();
  }

  loadReceiverCards(): void {
    if (!this.selectedReceiverId) return;
    this.loadingReceiverCards = true;
    this.chat.getUserShowcase(this.selectedReceiverId).subscribe({
      next: (cards) => {
        this.receiverCards = (cards || []).map(c => ({
          id: c.id ?? c.user_card_id,
          game_code: c.game_code,
          game_name: c.game_name ?? c.name,
          cover_url: c.cover_url,
          card_tier: c.card_tier ?? 'common',
          is_favorite: c.is_favorite ?? false,
        }));
        this.loadingReceiverCards = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingReceiverCards = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectReceiverCard(card: UserCard): void {
    this.selectedReceiverCard = card;
    this.checkFairness();
  }

  checkFairness(): void {
    this.fairness = null;
    if (!this.selectedProposerCard || !this.selectedReceiverCard) return;
    this.chat.checkTradeFairness(this.selectedProposerCard.id, this.selectedReceiverCard.id).subscribe({
      next: (res) => {
        this.fairness = res;
        this.cdr.markForCheck();
      },
    });
  }

  canPropose(): boolean {
    if (!this.selectedProposerCard || !this.selectedReceiverCard) return false;
    if (this.fairness && !this.fairness.isFair && !this.allowUnfair) return false;
    return true;
  }

  proposeTrade(): void {
    if (!this.canPropose() || !this.selectedProposerCard || !this.selectedReceiverCard) return;
    this.proposing = true;
    this.chat.createCardTrade(
      this.selectedProposerCard.id,
      this.selectedReceiverId,
      this.selectedReceiverCard.id,
      this.allowUnfair,
    ).subscribe({
      next: () => {
        this.proposing = false;
        this.resetPropose();
        this.activeTab = 'outgoing';
        this.loadTrades();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.proposing = false;
        this.error = err?.error?.message || 'Failed to propose trade';
        this.cdr.markForCheck();
      },
    });
  }

  resetPropose(): void {
    this.selectedProposerCard = null;
    this.selectedReceiverId = '';
    this.receiverCards = [];
    this.selectedReceiverCard = null;
    this.fairness = null;
    this.allowUnfair = false;
  }

  // ── Gift ──

  selectGiftCard(card: UserCard): void {
    this.giftCard = card;
  }

  selectGiftReceiver(friend: FriendUser): void {
    this.giftReceiverId = friend.other_id;
  }

  canGift(): boolean {
    return !!this.giftCard && !!this.giftReceiverId && this.giftReceiverId !== this.currentUserId;
  }

  sendGift(): void {
    if (!this.canGift() || !this.giftCard) return;
    this.gifting = true;
    this.chat.giftCard(this.giftCard.id, this.giftReceiverId).subscribe({
      next: () => {
        this.gifting = false;
        this.giftCard = null;
        this.giftReceiverId = '';
        this.loadProposerCards();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.gifting = false;
        this.error = err?.error?.message || 'Failed to gift card';
        this.cdr.markForCheck();
      },
    });
  }

  // ── User search for non-friends ──

  searchUsers(): void {
    if (!this.userSearch || this.userSearch.length < 2) {
      this.userSearchResults = [];
      return;
    }
    this.searching = true;
    const token = this.auth.getToken();
    this.http.get<any[]>(`${environment.apiUrl}/gg/users/search`, {
      params: { q: this.userSearch },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).subscribe({
      next: (users) => {
        this.userSearchResults = users || [];
        this.searching = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.searching = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectUser(user: any): void {
    this.selectedReceiverId = user.id;
    this.giftReceiverId = user.id;
    this.userSearch = '';
    this.userSearchResults = [];
    if (this.activeTab === 'propose') {
      this.loadReceiverCards();
    }
  }

  selectUserForGift(user: any): void {
    this.giftReceiverId = user.id;
    this.userSearch = '';
    this.userSearchResults = [];
  }
}
