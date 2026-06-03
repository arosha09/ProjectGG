import { Component, EventEmitter, HostListener, Input, OnInit, Output, ChangeDetectorRef, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';
import { ChatService, FriendUser } from '../../services/chat.service';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { Socket } from 'socket.io-client';
import { PaginatorComponent } from '../paginator/paginator.component';
import { CyberDropdownComponent, DropdownItem } from '../cyber-dropdown/cyber-dropdown.component';

type TradeTab = 'incoming' | 'outgoing' | 'completed' | 'propose' | 'gift' | 'gifts';

interface TradeCardEntry {
  card_id: number;
  game_code: string | null;
  game_name: string | null;
  cover_url: string | null;
  tier: string | null;
}

interface Trade {
  trade_id: number;
  trade_status: string;
  type: string;
  proposer_id: string;
  proposer_name: string;
  proposer_avatar: string | null;
  proposer_tier: string | null;
  proposer_card_id: number | null;
  proposer_game_code: string | null;
  proposer_cover: string | null;
  proposer_cards: TradeCardEntry[];
  proposer_cards_count: number;
  receiver_id: string;
  receiver_name: string;
  receiver_avatar: string | null;
  receiver_tier: string | null;
  receiver_card_id: number | null;
  receiver_game_code: string | null;
  receiver_cover: string | null;
  receiver_cards: TradeCardEntry[];
  receiver_cards_count: number;
  counter_proposer_cards: TradeCardEntry[];
  counter_receiver_cards: TradeCardEntry[];
  parent_trade_id: number | null;
  message: string | null;
  allow_unfair: boolean;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, PaginatorComponent, CyberDropdownComponent],
  templateUrl: './gg-card-trading-view.component.html',
  styleUrls: ['./gg-card-trading-view.component.scss'],
})
export class GgCardTradingViewComponent implements OnInit, OnDestroy {
  @Input() currentUserId = '';
  @Input() friends: FriendUser[] = [];
  @Input() filterUserId = '';
  @Input() startOnGiftTab = false;
  @Input() startOnProposeTab = false;
  @Input() lockedUserId = '';
  @Input() lockedUsername = '';
  @Input() lockedAvatar: string | null = null;
  @Input() hideHeader = false;
  @Input() focusTradeId: number | null = null;
  @Output() accepted = new EventEmitter<number>();
  @Output() rejected = new EventEmitter<number>();
  @Output() cancelled = new EventEmitter<number>();
  @Output() counterSent = new EventEmitter<number>();

  activeTab: TradeTab = 'incoming';
  trades: Trade[] = [];
  loading = false;
  error: string | null = null;

  // Propose trade (multi-card)
  proposerCards: UserCard[] = [];
  loadingProposerCards = false;
  proposerCardPage = 1;
  proposerCardPageSize = 10;
  proposerCardTotal = 0;
  proposerSort: 'newest' | 'name' | 'tier' = 'newest';
  selectedProposerCards: Set<number> = new Set();
  selectedReceiverId = '';
  receiverCards: UserCard[] = [];
  loadingReceiverCards = false;
  receiverCardPage = 1;
  receiverCardPageSize = 10;
  receiverCardTotal = 0;
  receiverSort: 'newest' | 'name' | 'tier' = 'newest';
  selectedReceiverCards: Set<number> = new Set();
  fairness: { isFair: boolean; tierDiff: number; proposerValue: number; receiverValue: number; proposerTier: string; receiverTier: string } | null = null;
  allowUnfair = false;
  proposing = false;
  proposeMessage = '';
  countering = false;
  counteringTradeId: number | null = null;

  // Gift
  giftCard: UserCard | null = null;
  giftReceiverId = '';
  gifting = false;

  // Search & Sort
  tradeSearch = '';
  tradeSort: 'newest' | 'oldest' | 'name' = 'newest';
  tradeSortOpen = false;
  tradeSortItems: DropdownItem[] = [
    { label: 'Newest first', action: () => this.onTradeSortChange('newest') },
    { label: 'Oldest first', action: () => this.onTradeSortChange('oldest') },
    { label: 'By name', action: () => this.onTradeSortChange('name') },
  ];

  // Sort dropdowns (propose/gift)
  proposerSortOpen = false;
  receiverSortOpen = false;
  proposerSortItems: DropdownItem[] = [
    { label: 'Newest', action: () => this.onProposerSortChange('newest') },
    { label: 'Name', action: () => this.onProposerSortChange('name') },
    { label: 'Tier', action: () => this.onProposerSortChange('tier') },
  ];
  receiverSortItems: DropdownItem[] = [
    { label: 'Newest', action: () => this.onReceiverSortChange('newest') },
    { label: 'Name', action: () => this.onReceiverSortChange('name') },
    { label: 'Tier', action: () => this.onReceiverSortChange('tier') },
  ];

  // User search (for non-friends)
  userSearch = '';
  userSearchResults: any[] = [];
  searching = false;

  private socket: Socket | null = null;
  private _tradeHandler = () => this.loadTrades();
  private _cardsHandler = () => this.loadProposerCards();

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  @HostListener('document:click')
  onDocumentClick(): void {
    this.tradeSortOpen = false;
    this.proposerSortOpen = false;
    this.receiverSortOpen = false;
  }

  ngOnInit(): void {
    if (this.startOnGiftTab) {
      this.activeTab = 'gift';
    } else if (this.startOnProposeTab || this.lockedUserId) {
      this.activeTab = 'propose';
    }
    if (this.lockedUserId) {
      this.selectedReceiverId = this.lockedUserId;
      this.giftReceiverId = this.lockedUserId;
    }
    if (this.lockedUserId && !this.lockedAvatar) {
      this.fetchLockedAvatar();
    }
    this.loadTrades();
    if (this.activeTab === 'propose') {
      this.loadProposerCards();
      if (this.lockedUserId) this.loadReceiverCards();
    }
    this.connectSocket();
  }

  ngOnDestroy(): void {
    if (this.socket) {
      this.socket.off('trade:new', this._tradeHandler);
      this.socket.off('trade:accepted', this._tradeHandler);
      this.socket.off('trade:rejected', this._tradeHandler);
      this.socket.off('trade:cancelled', this._tradeHandler);
      this.socket.off('cards:updated', this._cardsHandler);
    }
  }

  private connectSocket(): void {
    try {
      this.socket = this.chat.connect();
      this.socket.on('trade:new', this._tradeHandler);
      this.socket.on('trade:accepted', this._tradeHandler);
      this.socket.on('trade:rejected', this._tradeHandler);
      this.socket.on('trade:cancelled', this._tradeHandler);
      this.socket.on('cards:updated', this._cardsHandler);
    } catch { /* non-critical */ }
  }

  private fetchLockedAvatar(): void {
    const friend = this.friends.find(f => f.other_id === this.lockedUserId);
    if (friend?.other_avatar) {
      this.lockedAvatar = friend.other_avatar;
      this.cdr.markForCheck();
      return;
    }
    this.chat.getUserById(this.lockedUserId).subscribe({
      next: (user) => {
        if (user?.avatar) this.lockedAvatar = user.avatar;
        if (!this.lockedUsername && user?.username) this.lockedUsername = user.username;
        this.cdr.markForCheck();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  loadTrades(): void {
    this.loading = true;
    this.error = null;
    // When focusing on a specific trade, load all trades so we can find it
    const userId = this.focusTradeId ? undefined : (this.filterUserId || undefined);
    this.chat.getCardTrades(userId).subscribe({
      next: (trades) => {
        this.trades = (trades || []).map((t: any) => this.normalizeTrade(t));
        this.loading = false;
        if (this.focusTradeId) {
          this.focusFocusedTrade();
          this.focusTradeId = null;
        }
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

  private normalizeTrade(t: any): Trade {
    return {
      trade_id: t.trade_id,
      trade_status: t.trade_status,
      type: t.type || 'trade',
      proposer_id: t.proposer_id,
      proposer_name: t.proposer_name,
      proposer_avatar: t.proposer_avatar,
      proposer_tier: t.proposer_tier,
      proposer_card_id: t.proposer_card_id,
      proposer_game_code: t.proposer_game_code,
      proposer_cover: t.proposer_cover,
      proposer_cards: t.proposer_cards?.length
        ? t.proposer_cards
        : (t.proposer_card_id ? [{
            card_id: t.proposer_card_id,
            game_code: t.proposer_game_code,
            game_name: t.proposer_game_code,
            cover_url: t.proposer_cover,
            tier: t.proposer_tier,
          }] : []),
      proposer_cards_count: t.proposer_cards_count ?? (t.proposer_cards?.length ?? (t.proposer_card_id ? 1 : 0)),
      receiver_id: t.receiver_id,
      receiver_name: t.receiver_name,
      receiver_avatar: t.receiver_avatar,
      receiver_tier: t.receiver_tier,
      receiver_card_id: t.receiver_card_id,
      receiver_game_code: t.receiver_game_code,
      receiver_cover: t.receiver_cover,
      receiver_cards: t.receiver_cards?.length
        ? t.receiver_cards
        : (t.receiver_card_id ? [{
            card_id: t.receiver_card_id,
            game_code: t.receiver_game_code,
            game_name: t.receiver_game_code,
            cover_url: t.receiver_cover,
            tier: t.receiver_tier,
          }] : []),
      receiver_cards_count: t.receiver_cards_count ?? (t.receiver_cards?.length ?? (t.receiver_card_id ? 1 : 0)),
      counter_proposer_cards: t.counter_proposer_cards || [],
      counter_receiver_cards: t.counter_receiver_cards || [],
      parent_trade_id: t.parent_trade_id ?? null,
      message: t.message ?? null,
      allow_unfair: t.allow_unfair ?? false,
      created_at: t.created_at,
      resolved_at: t.resolved_at,
    };
  }

  private focusFocusedTrade(): void {
    if (!this.focusTradeId) return;
    const t = this.trades.find(x => x.trade_id === this.focusTradeId);
    if (!t) return;
    this.activeTab = t.receiver_id === this.currentUserId ? 'incoming' : 'outgoing';
  }

  private filterAndSort(trades: Trade[]): Trade[] {
    let result = trades;
    if (this.tradeSearch.trim()) {
      const q = this.tradeSearch.toLowerCase();
      result = result.filter(t => {
        const allCards = [
          ...(t.proposer_cards || []),
          ...(t.receiver_cards || []),
          ...(t.counter_proposer_cards || []),
          ...(t.counter_receiver_cards || []),
        ];
        return (
          (t.proposer_name || '').toLowerCase().includes(q) ||
          (t.receiver_name || '').toLowerCase().includes(q) ||
          allCards.some(c => (c.game_code || '').toLowerCase().includes(q) || (c.game_name || '').toLowerCase().includes(q))
        );
      });
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
    return this.filterAndSort(
      this.trades.filter(t =>
        t.trade_status === 'pending' &&
        t.receiver_id === this.currentUserId &&
        (t.type || 'trade') === 'trade' &&
        !t.parent_trade_id,
      ),
    );
  }

  get counterTrades(): Trade[] {
    return this.filterAndSort(
      this.trades.filter(t =>
        t.trade_status === 'pending' &&
        t.receiver_id === this.currentUserId &&
        (t.type || 'trade') === 'trade' &&
        !!t.parent_trade_id,
      ),
    );
  }

  get outgoingTrades(): Trade[] {
    return this.filterAndSort(
      this.trades.filter(t =>
        t.trade_status === 'pending' &&
        t.proposer_id === this.currentUserId &&
        (t.type || 'trade') === 'trade',
      ),
    );
  }

  get completedTrades(): Trade[] {
    return this.filterAndSort(
      this.trades.filter(t =>
        (t.trade_status === 'accepted' || t.trade_status === 'rejected' || t.trade_status === 'cancelled') &&
        (t.type || 'trade') === 'trade',
      ),
    );
  }

  get giftHistory(): Trade[] {
    return this.filterAndSort(
      this.trades.filter(t =>
        t.type === 'gift' && (t.proposer_id === this.currentUserId || t.receiver_id === this.currentUserId),
      ),
    );
  }

  get incomingCount(): number {
    return this.incomingTrades.length;
  }

  accept(tradeId: number): void {
    this.chat.acceptCardTrade(tradeId).subscribe({
      next: () => { this.loadTrades(); this.accepted.emit(tradeId); this.cdr.markForCheck(); },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to accept trade';
        this.cdr.markForCheck();
      },
    });
  }

  reject(tradeId: number): void {
    this.chat.rejectCardTrade(tradeId).subscribe({
      next: () => { this.loadTrades(); this.rejected.emit(tradeId); this.cdr.markForCheck(); },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to reject trade';
        this.cdr.markForCheck();
      },
    });
  }

  cancel(tradeId: number): void {
    this.chat.cancelCardTrade(tradeId).subscribe({
      next: () => { this.loadTrades(); this.cancelled.emit(tradeId); this.cdr.markForCheck(); },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to cancel trade';
        this.cdr.markForCheck();
      },
    });
  }

  switchTab(tab: TradeTab): void {
    this.activeTab = tab;
    if (tab === 'propose' && this.proposerCards.length === 0) {
      this.loadProposerCards();
    } else if (tab === 'gift' && this.proposerCards.length === 0) {
      this.loadProposerCards();
    }
    if ((tab === 'propose' || tab === 'gift') && this.lockedUserId) {
      this.selectedReceiverId = this.lockedUserId;
      this.giftReceiverId = this.lockedUserId;
      if (tab === 'propose' && this.receiverCards.length === 0) {
        this.loadReceiverCards();
      }
    }
  }

  // ── Propose trade ──

  loadProposerCards(): void {
    this.loadingProposerCards = true;
    this.chat.getCardCollection(this.proposerCardPage, this.proposerCardPageSize, undefined, undefined, this.proposerSort).subscribe({
      next: (res) => {
        this.proposerCards = (res?.items || []).map(c => ({
          id: c.id ?? c.user_card_id,
          game_code: c.game_code,
          game_name: c.game_name ?? c.name,
          cover_url: c.cover_url,
          card_tier: c.card_tier ?? 'common',
          is_favorite: c.is_favorite ?? false,
        }));
        this.proposerCardTotal = res?.total ?? 0;
        this.loadingProposerCards = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingProposerCards = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToProposerPage(page: number): void {
    const total = Math.max(1, Math.ceil(this.proposerCardTotal / this.proposerCardPageSize));
    const bounded = Math.max(1, Math.min(page, total));
    if (bounded === this.proposerCardPage) return;
    this.proposerCardPage = bounded;
    this.loadProposerCards();
  }

  get proposerCardTotalPages(): number {
    return Math.max(1, Math.ceil(this.proposerCardTotal / this.proposerCardPageSize));
  }

  onProposerSortChange(sort: 'newest' | 'name' | 'tier'): void {
    this.proposerSort = sort;
    this.proposerSortOpen = false;
    this.proposerCardPage = 1;
    this.loadProposerCards();
  }

  onReceiverSortChange(sort: 'newest' | 'name' | 'tier'): void {
    this.receiverSort = sort;
    this.receiverSortOpen = false;
    this.receiverCardPage = 1;
    this.loadReceiverCards();
  }

  onTradeSortChange(sort: 'newest' | 'oldest' | 'name'): void {
    this.tradeSort = sort;
    this.tradeSortOpen = false;
    this.cdr.markForCheck();
  }

  toggleProposerCard(card: UserCard): void {
    if (this.selectedProposerCards.has(card.id)) {
      this.selectedProposerCards.delete(card.id);
    } else {
      this.selectedProposerCards.add(card.id);
    }
    this.checkFairness();
    this.cdr.markForCheck();
  }

  isProposerSelected(card: UserCard): boolean {
    return this.selectedProposerCards.has(card.id);
  }

  selectReceiverFriend(friend: FriendUser): void {
    this.selectedReceiverId = friend.other_id;
    this.selectedReceiverCards.clear();
    this.loadReceiverCards();
  }

  loadReceiverCards(): void {
    if (!this.selectedReceiverId) return;
    this.loadingReceiverCards = true;
    this.chat.getUserShowcase(this.selectedReceiverId, this.receiverCardPage, this.receiverCardPageSize, this.receiverSort).subscribe({
      next: (res) => {
        this.receiverCards = (res?.items || []).map(c => ({
          id: c.id ?? c.user_card_id,
          game_code: c.game_code,
          game_name: c.game_name ?? c.name,
          cover_url: c.cover_url,
          card_tier: c.card_tier ?? 'common',
          is_favorite: c.is_favorite ?? false,
        }));
        this.receiverCardTotal = res?.total ?? 0;
        this.loadingReceiverCards = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingReceiverCards = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToReceiverPage(page: number): void {
    const total = Math.max(1, Math.ceil(this.receiverCardTotal / this.receiverCardPageSize));
    const bounded = Math.max(1, Math.min(page, total));
    if (bounded === this.receiverCardPage) return;
    this.receiverCardPage = bounded;
    this.loadReceiverCards();
  }

  get receiverCardTotalPages(): number {
    return Math.max(1, Math.ceil(this.receiverCardTotal / this.receiverCardPageSize));
  }

  toggleReceiverCard(card: UserCard): void {
    if (this.selectedReceiverCards.has(card.id)) {
      this.selectedReceiverCards.delete(card.id);
    } else {
      this.selectedReceiverCards.add(card.id);
    }
    this.checkFairness();
    this.cdr.markForCheck();
  }

  isReceiverSelected(card: UserCard): boolean {
    return this.selectedReceiverCards.has(card.id);
  }

  checkFairness(): void {
    this.fairness = null;
    const pIds = Array.from(this.selectedProposerCards);
    const rIds = Array.from(this.selectedReceiverCards);
    if (!pIds.length || !rIds.length) return;
    this.chat.checkTradeFairness(pIds, rIds).subscribe({
      next: (res) => {
        this.fairness = res;
        this.cdr.markForCheck();
      },
    });
  }

  canPropose(): boolean {
    if (this.selectedProposerCards.size === 0 || this.selectedReceiverCards.size === 0) return false;
    if (!this.selectedReceiverId) return false;
    if (this.fairness && !this.fairness.isFair && !this.allowUnfair) return false;
    return true;
  }

  get lockedReceiverName(): string {
    if (this.lockedUsername) return this.lockedUsername;
    if (this.lockedUserId) {
      const friend = this.friends.find(f => f.other_id === this.lockedUserId);
      if (friend) return friend.other_username;
    }
    return 'Friend';
  }

  get lockedReceiverAvatar(): string | null {
    if (this.lockedAvatar) return this.lockedAvatar;
    if (this.lockedUserId) {
      const friend = this.friends.find(f => f.other_id === this.lockedUserId);
      return friend?.other_avatar ?? null;
    }
    return null;
  }

  proposeTrade(): void {
    if (!this.canPropose()) return;
    this.proposing = true;
    this.error = null;
    const proposerCardIds = Array.from(this.selectedProposerCards);
    const receiverCardIds = Array.from(this.selectedReceiverCards);
    this.chat.createCardTrade(
      proposerCardIds,
      this.selectedReceiverId,
      receiverCardIds,
      this.allowUnfair,
      this.proposeMessage || undefined,
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
    this.selectedProposerCards.clear();
    this.selectedReceiverCards.clear();
    this.fairness = null;
    this.allowUnfair = false;
    this.proposeMessage = '';
    this.countering = false;
    this.counteringTradeId = null;
  }

  // ── Counter-proposal ──

  startCounter(trade: Trade): void {
    if (trade.trade_status !== 'pending' || trade.receiver_id !== this.currentUserId) return;
    this.activeTab = 'propose';
    this.selectedReceiverId = trade.proposer_id;
    this.lockedUserId = trade.proposer_id;
    this.lockedUsername = trade.proposer_name;
    this.lockedAvatar = trade.proposer_avatar;
    this.selectedReceiverCards.clear();
    this.selectedProposerCards.clear();
    this.allowUnfair = true;
    this.proposeMessage = '';
    this.countering = true;
    this.counteringTradeId = trade.trade_id;
    this.loadProposerCards();
    this.loadReceiverCards();
    this.cdr.markForCheck();
  }

  cancelCounter(): void {
    this.countering = false;
    this.counteringTradeId = null;
    this.resetPropose();
    this.activeTab = 'incoming';
    this.cdr.markForCheck();
  }

  sendCounter(): void {
    if (!this.canPropose() || !this.counteringTradeId) return;
    this.proposing = true;
    this.error = null;
    this.chat.counterCardTrade(
      this.counteringTradeId,
      Array.from(this.selectedProposerCards),
      Array.from(this.selectedReceiverCards),
      this.proposeMessage || undefined,
    ).subscribe({
      next: () => {
        this.proposing = false;
        const id = this.counteringTradeId!;
        this.resetPropose();
        this.activeTab = 'outgoing';
        this.loadTrades();
        this.counterSent.emit(id);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.proposing = false;
        this.error = err?.error?.message || 'Failed to send counter';
        this.cdr.markForCheck();
      },
    });
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

  get currentCounterTrade(): Trade | null {
    if (!this.counteringTradeId) return null;
    return this.trades.find(t => t.trade_id === this.counteringTradeId) || null;
  }
}
