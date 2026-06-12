import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ChatService } from '../../services/chat.service';
import { PaginatorComponent } from '../paginator/paginator.component';
import { CyberDropdownComponent, DropdownItem } from '../cyber-dropdown/cyber-dropdown.component';
import { WebpSrcDirective } from '../webp-src/webp-src.directive';

interface TradeFairnessResult {
  isFair: boolean;
  tierDiff: number;
  proposerTier: string;
  receiverTier: string;
}

interface TradeFriend {
  id: string;
  username: string;
  avatar: string | null;
  name?: string | null;
}

@Component({
  selector: 'app-card-collection',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatCardModule, MatIconModule, PaginatorComponent, CyberDropdownComponent, WebpSrcDirective],
  template: `
    <section class="collection-shell">
      <div class="collection-header">
        <div>
          <p class="collection-kicker">Arsenal</p>
          <h2 class="collection-title">MY COLLECTION</h2>
          <p class="collection-subtitle">Cards collected in your arsenal.</p>
        </div>
        <div class="collection-count-wrap">
          <span class="collection-count" [class.count-flash]="countFlashing">{{ displayCount }} total cards</span>
        </div>
      </div>

      @if (stats) {
        <div class="stats-row">
          @for (tier of tierStats; track tier.tier) {
            <div class="stat-chip" [ngClass]="'tier-' + tier.tier">
              <span class="stat-tier">{{ tier.tier }}</span>
              <span class="stat-count">{{ tier.count }}</span>
            </div>
          }
        </div>
      }

@if (selectedCard) {
  <div class="detail-panel">
    <div class="detail-panel-header">
      <div>
        <h3>{{ selectedCard.game_name }}</h3>
        <p class="trade-subtitle">{{ selectedCard.card_tier.toUpperCase() }} CARD</p>
      </div>
    </div>
    <div class="detail-card-layout">
      <mat-card class="owned-card detail-view-card" [ngClass]="'tier-' + selectedCard.card_tier" (click)="openImageView()">
        <div class="card-media owned-media" [class.has-image]="!!selectedCard.cover_url">
          <div class="tier-badge" [ngClass]="'tier-' + selectedCard.card_tier">
            {{ selectedCard.card_tier }}
          </div>
          <img loading="lazy" decoding="async" *ngIf="selectedCard.cover_url"
            class="cover-image"
            [src]="selectedCard.cover_url"
            [alt]="selectedCard.game_name"
            (error)="onImgError($event)"
          />
          <div class="cover-overlay"></div>
          <div class="game-content owned-content">
            <div class="game-top">
              <h3>{{ selectedCard.game_name }}</h3>
              @if (selectedCard.rating) {
                <span class="rating-badge">{{ selectedCard.rating }}</span>
              }
            </div>
          </div>
          <div class="view-icon-overlay">
            <mat-icon svgIcon="visibility"></mat-icon>
          </div>
        </div>
      </mat-card>

@if (showImageViewer) {
  <div class="image-viewer-overlay" (click)="closeImageView()">
    <div class="image-viewer-content" (click)="$event.stopPropagation()">
      <button type="button" class="image-viewer-close" (click)="closeImageView()">
        <mat-icon svgIcon="close"></mat-icon>
      </button>
      <img loading="lazy" decoding="async" [src]="selectedCard.cover_url" [alt]="selectedCard.game_name" (error)="onImgError($event)" />
      <div class="image-viewer-info">
        <h2>{{ selectedCard.game_name }}</h2>
        <span class="tier-badge" [ngClass]="'tier-' + selectedCard.card_tier">{{ selectedCard.card_tier }}</span>
      </div>
    </div>
  </div>
}

<div class="detail-card-body">
        @if (selectedCard.desc) {
          <p class="detail-description">{{ selectedCard.desc }}</p>
        }
        <div class="detail-meta-grid">
          @if (selectedCard.rating) {
            <div class="detail-meta-item">
              <mat-icon svgIcon="star"></mat-icon>
              <span>Rating</span>
              <strong>{{ selectedCard.rating }}</strong>
            </div>
          }
          @if (selectedCard.release_year) {
            <div class="detail-meta-item">
              <mat-icon svgIcon="event"></mat-icon>
              <span>Released</span>
              <strong>{{ selectedCard.release_year }}</strong>
            </div>
          }
          @if (selectedCard.platforms?.length) {
            <div class="detail-meta-item detail-meta-full">
              <div class="meta-row">
                <mat-icon svgIcon="videogame_asset"></mat-icon>
                <span>Platforms</span>
                <strong>{{ selectedCard.platforms.join(', ') }}</strong>
              </div>
            </div>
          }
          @if (selectedCard.genres?.length) {
            <div class="detail-meta-item detail-meta-full">
              <div class="meta-row">
                <mat-icon svgIcon="movie_filter"></mat-icon>
                <span>Genres</span>
                <strong>{{ selectedCard.genres.join(', ') }}</strong>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  </div>
}

@if (selectedCard && viewMode === 'trade') {
<div class="trade-panel">
  <div class="trade-panel-header">
    <div>
      <p class="trade-kicker">{{ tradeMode === 'gift' ? 'Send a Gift' : 'Initiate Trade' }}</p>
      <h3>{{ selectedCard.game_name }}</h3>
      <p class="trade-subtitle">{{ selectedCard.card_tier }} card · {{ selectedCard.game_code }}</p>
    </div>
    <button type="button" class="trade-close-btn" (click)="showCardDetails()">
      <mat-icon svgIcon="close"></mat-icon>
    </button>
  </div>

  <div class="trade-picked-card">
    <div class="trade-picked-art" [style.border-color]="tierColor(selectedCard.card_tier)">
      <img loading="lazy" decoding="async" *ngIf="selectedCard.cover_url" [src]="selectedCard.cover_url" [alt]="selectedCard.game_name" (error)="onImgError($event)" />
      <div class="trade-picked-overlay"></div>
      <div class="trade-picked-badge" [style.color]="tierColor(selectedCard.card_tier)">{{ selectedCard.card_tier }}</div>
    </div>
    <div class="trade-picked-meta">
      <div class="trade-mode-switch">
        <button type="button" class="mode-btn" [class.active]="tradeMode === 'trade'" (click)="setTradeMode('trade')">Trade</button>
        <button type="button" class="mode-btn" [class.active]="tradeMode === 'gift'" (click)="setTradeMode('gift')">Gift</button>
      </div>
      <p class="trade-help">Pick a friend below, then choose their card or send this one as a gift.</p>
    </div>
  </div>

  @if (tradeMode === 'trade') {
    <button type="button" class="mode-btn" (click)="showCardDetails()">Back to details</button>
  }

  <div class="trade-search-block">
    <label class="trade-label" for="friend-search">Find a friend</label>
    <input
      id="friend-search"
      name="friend-search"
      class="trade-search"
      [(ngModel)]="friendQuery"
      (input)="searchFriends()"
      placeholder="Search by username"
      autocomplete="off"
    />
    @if (friendSearching) {
      <p class="trade-hint">Searching users...</p>
    } @if (friendResults.length > 0) {
      <div class="friend-results">
        @for (friend of friendResults; track friend.id) {
          <button type="button" class="friend-result" (click)="selectFriend(friend)">
            <img loading="lazy" decoding="async" [src]="friend.avatar || ''" alt="" (error)="onImgError($event)" />
            <span>
              <strong>{{ friend.username }}</strong>
              <em>{{ friend.name || 'Player' }}</em>
            </span>
          </button>
        }
      </div>
    } @else if (friendQuery.trim().length >= 2 && !friendSearching) {
      <p class="trade-hint">No matching users found.</p>
    }
  </div>

  @if (selectedFriend) {
    <div class="selected-friend-row">
      <div class="selected-friend-meta">
        <img loading="lazy" decoding="async" [src]="selectedFriend.avatar || ''" alt="" (error)="onImgError($event)" />
        <div>
          <strong>{{ selectedFriend.username }}</strong>
          <span>{{ selectedFriend.name || 'Selected friend' }}</span>
        </div>
      </div>
      <button type="button" class="trade-link-btn" (click)="clearFriendSelection()">Change friend</button>
    </div>
  }

  @if (tradeMode === 'trade') {
    <div class="friend-cards-block">
      <div class="trade-section-title">Choose their card</div>
      @if (friendCardsLoading) {
        <p class="trade-hint">Loading showcase...</p>
      } @else if (friendCards.length === 0) {
        <p class="trade-hint">No showcase cards are available for this player.</p>
      } @else {
        <div class="friend-cards-grid">
          @for (friendCard of friendCards; track friendCard.id ?? friendCard.game_code) {
            <button
              type="button"
              class="friend-card"
              [class.selected]="selectedReceiverCard?.id === friendCard.id"
              (click)="selectReceiverCard(friendCard)"
            >
              <img loading="lazy" decoding="async" [src]="friendCard.cover_url || ''" [alt]="friendCard.game_name" (error)="onImgError($event)" />
              <div class="friend-card-overlay"></div>
              <div class="friend-card-label">
                <strong>{{ friendCard.game_name }}</strong>
                <span>{{ friendCard.card_tier }}</span>
              </div>
            </button>
          }
        </div>
      }

      @if (fairnessCheck) {
        <div class="fairness-banner" [class.fair]="fairnessCheck.isFair">
          @if (fairnessCheck.isFair) {
            <mat-icon svgIcon="verified"></mat-icon>
            <span>Fair trade confirmed. You can send it as-is.</span>
          } @else {
            <mat-icon svgIcon="warning"></mat-icon>
            <span>Unfair trade: {{ fairnessCheck.proposerTier }} vs {{ fairnessCheck.receiverTier }} (tier gap {{ fairnessCheck.tierDiff }}).</span>
          }
        </div>
        @if (!fairnessCheck.isFair) {
          <label class="override-row">
            <input type="checkbox" name="override-unfair" [(ngModel)]="overrideUnfair" />
            Proceed anyway
          </label>
        }
      }
    </div>
  } @else {
    <div class="gift-note">
      <mat-icon svgIcon="card_giftcard"></mat-icon>
      <span>This sends your selected card without requiring a return card.</span>
    </div>
  }

  <div class="trade-actions">
    <button
      type="button"
      class="action-btn primary"
      [disabled]="tradeBusy || !selectedFriend || (tradeMode === 'trade' && !selectedReceiverCard)"
      (click)="tradeMode === 'trade' ? submitTrade() : sendGift()"
    >
      @if (tradeBusy) {
        <span class="btn-spinner"></span>
        Working...
      } @else {
        <mat-icon [svgIcon]="tradeMode === 'trade' ? 'swap_horiz' : 'card_giftcard'"></mat-icon>
        {{ tradeMode === 'trade' ? 'Propose Trade' : 'Send Gift' }}
      }
    </button>
    <button type="button" class="action-btn secondary" (click)="showCardDetails()" [disabled]="tradeBusy">Back</button>
  </div>

  @if (tradeMessage) {
    <p class="trade-message success">{{ tradeMessage }}</p>
  }
  @if (tradeError) {
    <p class="trade-message error">{{ tradeError }}</p>
  }
</div>
}

<!-- FILTERS -->
      <div class="filter-row">
        <button
          class="filter-btn filter-all"
          [class.active]="!activeTier"
          (click)="filterTier(null)"
        >
          ALL
        </button>
        <button
          class="filter-btn filter-fav-toggle"
          [class.active]="showFavoritesOnly"
          (click)="toggleFavoritesFilter()"
          [title]="showFavoritesOnly ? 'Show all cards' : 'Show favorites only'"
        >
          <mat-icon [svgIcon]="showFavoritesOnly ? 'star' : 'star_border'"></mat-icon>
        </button>
        @for (tier of tiers; track tier) {
          <button
            class="filter-btn"
            [class.active]="activeTier === tier"
            [ngClass]="'tier-' + tier"
            (click)="filterTier(tier)"
          >
            {{ tier.toUpperCase() }}
          </button>
        }
        <div class="sort-dropdown-wrap">
          <button class="sort-trigger" type="button" (click)="sortDropdownOpen = !sortDropdownOpen">
            <span>{{ sortBy | titlecase }}</span>
            <span class="sort-arrow">▼</span>
          </button>
          <app-cyber-dropdown [items]="sortItems" [isOpen]="sortDropdownOpen" (itemSelect)="sortDropdownOpen = false"></app-cyber-dropdown>
        </div>
        <input
          class="filter-search"
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
          placeholder="Search cards..."
        />
      </div>

      <!-- CARD GRID -->
      <div class="card-grid">
        @for (card of pagedCards; track card.game_code) {
          <mat-card
            class="owned-card"
            [class.selected-card]="selectedCard?.id === card.id"
            [class.recent-draw]="highlightGameCode === card.game_code"
            [ngClass]="'tier-' + card.card_tier"
            (click)="selectCard(card)"
          >
            <button
              class="card-fav"
              [class.active]="card.is_favorite"
              (click)="toggleFav.emit(card.game_code); $event.stopPropagation()"
            >
              <mat-icon [svgIcon]="card.is_favorite ? 'star' : 'star_border'"></mat-icon>
            </button>
            <div class="card-media owned-media" [class.has-image]="!!card.cover_url">
              <div class="tier-badge" [ngClass]="'tier-' + card.card_tier">
                {{ card.card_tier }}
              </div>
              <img loading="lazy" decoding="async" *ngIf="card.cover_url"
                class="cover-image"
                [appWebpSrc]="card.cover_url"
                [alt]="card.game_name"
                (error)="onImgError($event)"
              />
              <div class="cover-overlay"></div>

              <div class="game-content owned-content">
                <div class="game-top">
                  <h3>{{ card.game_name }}</h3>
                  @if (card.rating) {
                    <span class="rating-badge">{{ card.rating }}</span>
                  }
                </div>
              </div>
            </div>
          </mat-card>
        } @empty {
          <div class="card-empty">
            <div class="empty-icon">🎴</div>
            <h3>No cards collected yet</h3>
            <p>Draw some cards to start building your arsenal.</p>
          </div>
        }
      </div>

      <app-paginator
        class="collection-paginator"
        [currentPage]="page"
        [totalPages]="totalPages"
        (pageChange)="onPageChange($event)"
      ></app-paginator>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .collection-shell {
        padding: 18px;
        border-radius: 18px;
        border: 1px solid rgba(91, 217, 255, 0.12);
        background: linear-gradient(180deg, rgba(7, 9, 16, 0.9), rgba(8, 10, 18, 0.98));
        box-shadow:
          0 0 0 1px rgba(255, 45, 111, 0.08),
          inset 0 0 40px rgba(255, 45, 111, 0.03);
      }

      .collection-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 14px;
      }

      .collection-kicker {
        margin: 0 0 4px;
        font-size: 11px;
        letter-spacing: 4px;
        color: #ff4d84;
        font-weight: 800;
        text-transform: uppercase;
      }

      .collection-title {
        margin: 0;
        font-size: clamp(1.6rem, 3vw, 2.5rem);
        letter-spacing: 1px;
        color: #f4f7ff;
        text-shadow:
          0 0 18px rgba(91, 217, 255, 0.12),
          0 0 28px rgba(255, 45, 111, 0.14);
      }

      .collection-subtitle {
        margin: 6px 0 0;
        color: rgba(241, 247, 255, 0.62);
        font-size: 13px;
      }

      .collection-count-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
        min-width: 120px;
      }

      /* ── TOTAL CARDS badge: cyberpunk neon ── */
      .collection-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 12px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #0b0e16;
        background: linear-gradient(135deg, #5bd9ff, #ff4d84);
        font-weight: 900;
        border: 1px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 0 12px rgba(91, 217, 255, 0.35), 0 0 24px rgba(255, 45, 111, 0.15), inset 0 0 8px rgba(255, 255, 255, 0.15);
        position: relative;
        transition: box-shadow 0.4s;
      }

      .collection-count::before {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 8px;
        padding: 1.5px;
        background: linear-gradient(135deg, #5bd9ff, #ff4d84, #5bd9ff);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        opacity: 0.6;
      }

      .collection-count::after {
        content: '';
        position: absolute;
        inset: -4px;
        border-radius: 10px;
        background: linear-gradient(135deg, rgba(91, 217, 255, 0.15), rgba(255, 45, 111, 0.08));
        filter: blur(8px);
        z-index: -1;
      }

      .collection-count.count-flash {
        box-shadow: 0 0 20px rgba(91, 217, 255, 0.6), 0 0 40px rgba(255, 45, 111, 0.3), inset 0 0 12px rgba(255, 255, 255, 0.3);
      }

      .collection-count.secondary {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(241, 247, 255, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.06);
      }

      .collection-count.secondary::before,
      .collection-count.secondary::after {
        display: none;
      }

      /* ── STATS ROW ── */
      .stats-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 16px;
      }

      .trade-panel {
        margin-bottom: 16px;
        padding: 14px;
        border-radius: 14px;
        border: 1px solid rgba(91, 217, 255, 0.2);
        background: rgba(255, 255, 255, 0.02);
      }

      .trade-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .trade-kicker {
        margin: 0 0 4px;
        font-size: 10px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: rgba(241, 247, 255, 0.72);
      }

      .trade-panel h3 {
        margin: 0;
        font-size: 16px;
      }

      .trade-subtitle {
        margin: 4px 0 0;
        font-size: 12px;
        color: rgba(241, 247, 255, 0.62);
      }

      .trade-close-btn,
      .trade-link-btn,
      .action-btn,
      .mode-btn,
      .friend-result,
      .friend-card {
        font-family: inherit;
      }

      .trade-close-btn {
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.03);
        color: rgba(241, 247, 255, 0.85);
        border-radius: 10px;
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .trade-picked-card {
        display: grid;
        grid-template-columns: 90px 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }

      .trade-picked-art {
        position: relative;
        border: 2px solid;
        border-radius: 10px;
        overflow: hidden;
        min-height: 116px;
        background: rgba(0, 0, 0, 0.3);
      }

      .trade-picked-art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .trade-picked-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(7, 9, 16, 0.1), rgba(7, 9, 16, 0.8));
      }

      .trade-picked-badge {
        position: absolute;
        right: 6px;
        top: 6px;
        font-size: 10px;
        text-transform: uppercase;
        font-weight: 800;
        background: rgba(8, 10, 16, 0.85);
        padding: 2px 6px;
        border-radius: 6px;
      }

      .trade-mode-switch {
        display: inline-flex;
        gap: 8px;
      }

      .mode-btn {
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(241, 247, 255, 0.8);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        cursor: pointer;
      }

      .mode-btn.active {
        border-color: rgba(91, 217, 255, 0.7);
        color: #ffffff;
        background: rgba(91, 217, 255, 0.16);
      }

      .trade-help {
        margin: 8px 0 0;
        font-size: 12px;
        color: rgba(241, 247, 255, 0.72);
      }

      .trade-search-block {
        margin-bottom: 12px;
      }

      .trade-label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: rgba(241, 247, 255, 0.72);
      }

      .trade-search {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(0, 0, 0, 0.35);
        color: #f4f7ff;
        outline: none;
      }

      .trade-hint {
        margin: 8px 0 0;
        font-size: 12px;
        color: rgba(241, 247, 255, 0.62);
      }

      .friend-results {
        margin-top: 8px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 8px;
      }

      .friend-result {
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.03);
        color: #f4f7ff;
        border-radius: 10px;
        padding: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
        cursor: pointer;
      }

      .friend-result img,
      .selected-friend-meta img {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        background: rgba(255, 255, 255, 0.08);
      }

      .friend-result strong,
      .selected-friend-meta strong {
        display: block;
        font-size: 12px;
      }

      .friend-result em,
      .selected-friend-meta span {
        display: block;
        font-style: normal;
        font-size: 11px;
        color: rgba(241, 247, 255, 0.65);
      }

      .selected-friend-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      .selected-friend-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .trade-link-btn {
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: transparent;
        color: rgba(241, 247, 255, 0.8);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        cursor: pointer;
      }

      .trade-section-title {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .friend-cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 10px;
      }

      .friend-card {
        position: relative;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        overflow: hidden;
        background: rgba(7, 9, 16, 0.6);
        cursor: pointer;
        min-height: 150px;
      }

      .friend-card.selected {
        border-color: rgba(91, 217, 255, 0.9);
      }

      .friend-card img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        position: absolute;
        inset: 0;
      }

      .friend-card-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(7, 9, 16, 0.2), rgba(7, 9, 16, 0.95));
      }

      .friend-card-label {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 8px;
        z-index: 2;
      }

      .friend-card-label strong {
        display: block;
        font-size: 11px;
        margin-bottom: 3px;
      }

      .friend-card-label span {
        display: inline-block;
        font-size: 10px;
        text-transform: uppercase;
        opacity: 0.8;
      }

      .fairness-banner {
        margin-top: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255, 174, 0, 0.4);
        background: rgba(255, 174, 0, 0.08);
        color: #ffd98c;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }

      .fairness-banner.fair {
        border-color: rgba(0, 230, 118, 0.45);
        background: rgba(0, 230, 118, 0.1);
        color: #9ef6c2;
      }

      .override-row {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        margin-top: 8px;
        font-size: 12px;
        color: rgba(241, 247, 255, 0.75);
      }

      .gift-note {
        margin-top: 4px;
        padding: 10px;
        border: 1px dashed rgba(91, 217, 255, 0.35);
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(241, 247, 255, 0.82);
        font-size: 12px;
      }

      .trade-actions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .action-btn {
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        padding: 9px 12px;
        cursor: pointer;
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }

      .action-btn.primary {
        background: linear-gradient(135deg, #5bd9ff, #ff4d84);
        color: #0b0e16;
        border-color: transparent;
        font-weight: 700;
      }

      .action-btn.secondary {
        background: rgba(255, 255, 255, 0.02);
        color: rgba(241, 247, 255, 0.82);
      }

      .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .trade-message {
        margin: 10px 0 0;
        font-size: 12px;
      }

      .trade-message.success {
        color: #9ef6c2;
      }

      .trade-message.error {
        color: #ff97a7;
      }

      .btn-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .stat-chip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 108px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        /* No glow/box-shadow on any stat chip */
        box-shadow: none;
      }

      .stat-chip .stat-tier {
        font-size: 10px;
        letter-spacing: 2px;
        text-transform: uppercase;
        opacity: 0.86;
      }

      .stat-chip .stat-count {
        font-weight: 900;
        font-size: 16px;
      }

      /* Tier & Badge Styles */
      .tier-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 5;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 6px;
        background: #000000 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
        border: 2px solid;
      }
      .tier-common {
        color: #8c96a8;
        border-color: rgba(140, 150, 168, 0.4);
      }
      .tier-uncommon {
        color: #00e676;
        border-color: rgba(0, 230, 118, 0.4);
      }
      .tier-rare {
        color: #5fb6ff;
        border-color: rgba(95, 182, 255, 0.4);
      }
      .tier-epic {
        color: #aa44ff;
        border-color: rgba(170, 68, 255, 0.4);
      }
      .tier-legendary {
        color: #ffd700;
        border-color: rgba(255, 215, 0, 0.4);
      }

      @keyframes border-glow {
        0%,
        100% {
          border-color: rgba(255, 215, 0, 0.4);
        }
        50% {
          border-color: rgba(255, 215, 0, 1);
        }
      }

      /* ── CARD GRID ── */
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
        gap: 14px;
      }
      .owned-card {
        width: 100%;
        aspect-ratio: 16 / 23;
        padding: 0 !important;
        overflow: hidden;
        border-radius: 14px;
        position: relative;
        background: linear-gradient(180deg, rgba(6, 6, 8, 0.96), rgba(8, 10, 16, 0.98)) !important;
        border: 1px solid rgba(91, 217, 255, 0.18) !important;
        transition:
          transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
          box-shadow 0.2s,
          border-color 0.2s;
        cursor: pointer;
      }
      .owned-card:hover {
        transform: translateY(-8px) scale(1.03);
        box-shadow: 0 0 36px rgba(255, 45, 111, 0.24);
      }
      .owned-card.selected-card {
        box-shadow: 0 0 0 2px rgba(91, 217, 255, 0.75), 0 0 24px rgba(91, 217, 255, 0.25);
      }
      .owned-card.recent-draw {
        animation: recent-draw 1.8s ease-in-out 2;
        box-shadow: 0 0 32px rgba(255, 45, 111, 0.35);
      }

      /* ── TIER-BASED BORDERS ── */
      .owned-card.tier-common {
        border: 2px solid rgba(140, 150, 168, 0.45) !important;
      }
      .owned-card.tier-common:hover {
        border-color: rgba(140, 150, 168, 0.8) !important;
        box-shadow: 0 0 24px rgba(140, 150, 168, 0.2);
      }

      .owned-card.tier-uncommon {
        border: 2px solid rgba(0, 230, 118, 0.45) !important;
      }
      .owned-card.tier-uncommon:hover {
        border-color: rgba(0, 230, 118, 0.8) !important;
        box-shadow: 0 0 28px rgba(0, 230, 118, 0.24);
      }

      .owned-card.tier-rare {
        border: 2px solid rgba(95, 182, 255, 0.45) !important;
      }
      .owned-card.tier-rare:hover {
        border-color: rgba(95, 182, 255, 0.8) !important;
        box-shadow: 0 0 28px rgba(95, 182, 255, 0.24);
      }

      .owned-card.tier-epic {
        border: 2px solid rgba(170, 68, 255, 0.45) !important;
      }
      .owned-card.tier-epic:hover {
        border-color: rgba(170, 68, 255, 0.8) !important;
        box-shadow: 0 0 32px rgba(170, 68, 255, 0.28);
      }

      .owned-card.tier-legendary {
        border: 2px solid rgba(255, 215, 0, 0.55) !important;
      }
      .owned-card.tier-legendary:hover {
        border-color: rgba(255, 215, 0, 0.95) !important;
        box-shadow: 0 0 36px rgba(255, 215, 0, 0.32);
      }
      @keyframes recent-draw {
        0%,
        100% {
          transform: translateY(0) scale(1);
        }
        50% {
          transform: translateY(-10px) scale(1.03);
        }
      }

      .owned-media {
        width: 100%;
        height: 100%;
        position: relative;
      }
      .cover-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .cover-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(180deg, rgba(6, 10, 20, 0.3) 0%, rgba(4, 7, 14, 0.96) 90%);
      }
      .owned-content {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        padding: 16px;
        box-sizing: border-box;
      }

      .game-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      h3 {
        font-size: 14px;
        font-weight: 800;
        color: var(--text-primary);
        margin: 0;
      }
      .rating-badge {
        font-size: 10px;
        font-weight: 800;
        padding: 2px 5px;
        border-radius: 3px;
        background: rgba(255, 215, 0, 0.12);
        color: #ffd700;
      }

      .card-fav {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 10;
        background: #000000;
        border: 2px solid rgba(255, 215, 0, 0.6);
        color: #ffd700;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: 6px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
      }
      .card-fav:hover {
        background: rgba(0, 0, 0, 0.9);
        border-color: #ffd700;
        box-shadow: 0 0 16px rgba(255, 215, 0, 0.4);
      }
      .card-fav.active {
        color: #ffd700;
        border-color: #ffd700;
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
      }

      /* ── FILTER ROW ── */
      .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin-bottom: 16px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        position: relative;
      }

      /* Base filter button */
      .filter-btn {
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
        color: rgba(241, 247, 255, 0.8);
        padding: 7px 11px;
        border-radius: 999px;
        cursor: pointer;
        text-transform: capitalize;
        transition: all 0.2s ease;
        font-size: 12px;
        font-family: inherit;
        font-weight: 600;
      }

      .filter-btn.filter-fav-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 50%;
        border: 2px solid rgba(255, 215, 0, 0.3);
        background: rgba(255, 215, 0, 0.06);
        color: rgba(255, 215, 0, 0.5);
        flex-shrink: 0;
      }

      .filter-btn.filter-fav-toggle mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        line-height: 18px;
        transition: transform 0.2s ease, color 0.2s;
      }

      .filter-btn.filter-fav-toggle:hover {
        border-color: rgba(255, 215, 0, 0.6);
        background: rgba(255, 215, 0, 0.12);
        color: #ffd700;
      }

      .filter-btn.filter-fav-toggle.active {
        border-color: #ffd700;
        background: rgba(255, 215, 0, 0.2);
        color: #ffd700;
        box-shadow: 0 0 14px rgba(255, 215, 0, 0.3);
      }

      .filter-btn.filter-fav-toggle.active mat-icon {
        transform: scale(1.1);
      }

      /* "All" button — plain, no tier color */
      .filter-btn.filter-all {
        font-weight: 700;
        letter-spacing: 0.5px;
      }

      .filter-btn.filter-all:hover,
      .filter-btn.filter-all.active {
        background: rgba(255, 45, 111, 0.16);
        border-color: rgba(255, 45, 111, 0.45);
        color: #fff;
        box-shadow: 0 0 16px rgba(255, 45, 111, 0.12);
      }

      /* ── ALWAYS-ON colored borders for tier buttons ── */

      /* Common — always on */
      .filter-btn.tier-common {
        background: rgba(140, 150, 168, 0.08);
        border-color: rgba(140, 150, 168, 0.35);
        color: #8c96a8;
        font-family: inherit;
        font-weight: 600;
      }
      .filter-btn.tier-common:hover,
      .filter-btn.tier-common.active {
        background: rgba(140, 150, 168, 0.18);
        border-color: rgba(140, 150, 168, 0.65);
        color: #fff;
        box-shadow: 0 0 18px rgba(140, 150, 168, 0.22);
      }

      /* Uncommon — always on */
      .filter-btn.tier-uncommon {
        background: rgba(0, 230, 118, 0.08);
        border-color: rgba(0, 230, 118, 0.32);
        color: #00e676;
        box-shadow: 0 0 10px rgba(0, 230, 118, 0.12);
        animation: glow-uncommon 2s ease-in-out infinite;
        font-family: inherit;
        font-weight: 600;
      }
      .filter-btn.tier-uncommon:hover,
      .filter-btn.tier-uncommon.active {
        background: rgba(0, 230, 118, 0.18);
        border-color: rgba(0, 230, 118, 0.7);
        color: #eafff0;
        box-shadow: 0 0 24px rgba(0, 230, 118, 0.28);
      }
      @keyframes glow-uncommon {
        0%,
        100% {
          border-color: rgba(0, 230, 118, 0.32);
        }
        50% {
          border-color: rgba(0, 230, 118, 0.75);
        }
      }

      /* Rare — always on */
      .filter-btn.tier-rare {
        background: rgba(95, 182, 255, 0.08);
        border-color: rgba(95, 182, 255, 0.32);
        color: #5fb6ff;
        box-shadow: 0 0 10px rgba(95, 182, 255, 0.12);
        animation: glow-rare 2s ease-in-out infinite;
        font-family: inherit;
        font-weight: 600;
      }
      .filter-btn.tier-rare:hover,
      .filter-btn.tier-rare.active {
        background: rgba(95, 182, 255, 0.18);
        border-color: rgba(95, 182, 255, 0.72);
        color: #eaf6ff;
        box-shadow: 0 0 26px rgba(95, 182, 255, 0.28);
      }
      @keyframes glow-rare {
        0%,
        100% {
          border-color: rgba(95, 182, 255, 0.32);
        }
        50% {
          border-color: rgba(95, 182, 255, 0.78);
        }
      }

      /* Epic — always on */
      .filter-btn.tier-epic {
        background: rgba(170, 68, 255, 0.08);
        border-color: rgba(170, 68, 255, 0.32);
        color: #aa44ff;
        box-shadow: 0 0 10px rgba(170, 68, 255, 0.12);
        animation: glow-epic 2s ease-in-out infinite;
        font-family: inherit;
        font-weight: 600;
      }
      .filter-btn.tier-epic:hover,
      .filter-btn.tier-epic.active {
        background: rgba(170, 68, 255, 0.18);
        border-color: rgba(170, 68, 255, 0.72);
        color: #f6eaff;
        box-shadow: 0 0 28px rgba(170, 68, 255, 0.28);
      }
      @keyframes glow-epic {
        0%,
        100% {
          border-color: rgba(170, 68, 255, 0.32);
        }
        50% {
          border-color: rgba(170, 68, 255, 0.78);
        }
      }

      /* Legendary — always on (matches existing chip style) */
      .filter-btn.tier-legendary {
        background: rgba(255, 215, 0, 0.1);
        border-color: rgba(255, 215, 0, 0.45);
        color: #ffd700;
        box-shadow: 0 0 18px rgba(255, 215, 0, 0.22);
        animation: glow-legendary 2s ease-in-out infinite;
        font-family: inherit;
        font-weight: 600;
      }
      .filter-btn.tier-legendary:hover,
      .filter-btn.tier-legendary.active {
        background: rgba(255, 215, 0, 0.18);
        border-color: rgba(255, 215, 0, 0.9);
        color: #fff8e6;
        box-shadow: 0 0 36px rgba(255, 215, 0, 0.4);
      }
      @keyframes glow-legendary {
        0%,
        100% {
          border-color: rgba(255, 215, 0, 0.45);
        }
        50% {
          border-color: rgba(255, 215, 0, 1);
        }
      }

      .filter-search {
        margin-left: auto;
        min-width: min(100%, 240px);
        flex: 1 1 240px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.24);
        color: #f4f7ff;
        outline: none;
      }

      .sort-dropdown-wrap {
        position: relative;

        .sort-trigger {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.24);
          color: rgba(241, 247, 255, 0.8);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;

          &:hover {
            border-color: rgba(255, 45, 111, 0.45);
            color: #fff;
          }

          .sort-arrow {
            font-size: 8px;
            opacity: 0.6;
          }
        }
      }

      .filter-search::placeholder {
        color: rgba(241, 247, 255, 0.34);
      }

      /* ── DETAIL PANEL ── */
      .detail-panel {
        margin-bottom: 16px;
        padding: 14px;
        border-radius: 14px;
        border: 1px solid rgba(91, 217, 255, 0.2);
        background: rgba(255, 255, 255, 0.02);
      }

      .detail-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .detail-card-layout {
        display: grid;
        grid-template-columns: 160px 1fr;
        gap: 16px;
        align-items: start;
      }

      .detail-card-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .detail-view-card {
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .detail-view-card:hover {
        transform: scale(1.02);
        box-shadow: 0 0 30px rgba(91, 217, 255, 0.3);
      }

      .view-icon-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.4);
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 6;
      }

      .detail-view-card:hover .view-icon-overlay {
        opacity: 1;
      }

      .view-icon-overlay mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #ffffff;
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8));
      }

      /* ── IMAGE VIEWER ── */
      .image-viewer-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.92);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
      }

      .image-viewer-content {
        position: relative;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .image-viewer-content img {
        max-width: 100%;
        max-height: 80vh;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 0 60px rgba(0, 0, 0, 0.8);
      }

      .image-viewer-close {
        position: absolute;
        top: -40px;
        right: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .image-viewer-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .image-viewer-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .image-viewer-info h2 {
        margin: 0;
        color: #f4f7ff;
        font-size: 18px;
        font-weight: 700;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .detail-description {
        margin: 0;
        font-size: 13px;
        color: rgba(241, 247, 255, 0.82);
        line-height: 1.5;
      }

      .detail-meta-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .detail-meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: rgba(241, 247, 255, 0.7);
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .detail-meta-item mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
        color: var(--accent-color, #5bd9ff);
      }

      .detail-meta-item span {
        min-width: 70px;
        color: rgba(241, 247, 255, 0.5);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .detail-meta-item strong {
        color: #f4f7ff;
        font-weight: 600;
      }

      .detail-meta-item.detail-meta-full {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }

      .detail-meta-item.detail-meta-full .meta-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      .detail-meta-item.detail-meta-full span {
        min-width: auto;
      }

      .close-detail-btn {
        align-self: flex-start;
        margin-top: 8px;
      }

      /* ── EMPTY STATE ── */
      .card-empty {
        grid-column: 1 / -1;
        min-height: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 16px;
        border: 1px dashed rgba(91, 217, 255, 0.22);
        background:
          radial-gradient(circle at top, rgba(255, 45, 111, 0.06), transparent 40%),
          rgba(255, 255, 255, 0.02);
        color: rgba(241, 247, 255, 0.72);
        text-align: center;
        padding: 24px;
      }

      .empty-icon {
        font-size: 36px;
        margin-bottom: 4px;
      }

      .card-empty h3 {
        margin: 0;
        color: #f4f7ff;
        font-size: 18px;
      }
      .card-empty p {
        margin: 0;
        max-width: 280px;
      }

      .collection-paginator {
        display: block;
        margin-top: 18px;
      }

      @media (max-width: 720px) {
        .collection-header {
          flex-direction: column;
        }
        .collection-count-wrap {
          align-items: flex-start;
        }
        .filter-search {
          margin-left: 0;
          width: 100%;
        }
        .card-grid {
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        }
      }
    `,
  ],
})
export class CardCollectionComponent implements OnChanges {
  constructor(private readonly chatService: ChatService) {}

  @Input() cards: any[] = [];
  @Input() totalCards = 0;
  @Input() page = 1;
  @Input() pageSize = 10;
  @Input() stats: any = null;
  @Input() highlightGameCode: string | null = null;
  @Output() toggleFav = new EventEmitter<string>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() tierFilter = new EventEmitter<string | null>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() sortChange = new EventEmitter<string>();
  @Output() startTrade = new EventEmitter<any>();

  displayCount = 0;
  countFlashing = false;
  private countRaf: number | null = null;

  defaultCover = '';
  activeTier: string | null = null;
  showFavoritesOnly = false;
  searchQuery = '';
  sortBy: 'newest' | 'name' | 'tier' = 'newest';
  sortDropdownOpen = false;
  sortItems: DropdownItem[] = [
    { label: 'Newest', action: () => this.onSortChange('newest') },
    { label: 'Name', action: () => this.onSortChange('name') },
    { label: 'Tier', action: () => this.onSortChange('tier') },
  ];
  selectedCard: any = null;

  ngOnChanges(changes: any): void {
    if (changes.totalCards && changes.totalCards.currentValue !== changes.totalCards.previousValue) {
      this.animateCount(changes.totalCards.previousValue ?? 0, changes.totalCards.currentValue);
    }
  }

  private animateCount(from: number, to: number): void {
    if (this.countRaf !== null) cancelAnimationFrame(this.countRaf);
    this.countFlashing = true;
    const duration = Math.min(1000, Math.max(300, Math.abs(to - from) * 40));
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.displayCount = Math.round(from + (to - from) * eased);
      if (t < 1) {
        this.countRaf = requestAnimationFrame(tick);
      } else {
        this.displayCount = to;
        this.countRaf = null;
        setTimeout(() => { this.countFlashing = false; }, 600);
      }
    };
    this.countRaf = requestAnimationFrame(tick);
  }
  viewMode: 'details' | 'trade' = 'details';
  tradeMode: 'trade' | 'gift' = 'trade';
  friendQuery = '';
  friendResults: TradeFriend[] = [];
  friendSearching = false;
  selectedFriend: TradeFriend | null = null;
  friendCards: any[] = [];
  friendCardsLoading = false;
  selectedReceiverCard: any = null;
  fairnessCheck: TradeFairnessResult | null = null;
  overrideUnfair = false;
  tradeBusy = false;
  tradeMessage: string | null = null;
  tradeError: string | null = null;
  showImageViewer = false;

  openImageView(): void {
    if (this.selectedCard?.cover_url) {
      this.showImageViewer = true;
    }
  }

  closeImageView(): void {
    this.showImageViewer = false;
  }

  tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  readonly tierColors: Record<string, string> = {
    common: '#8c96a8',
    uncommon: '#00e676',
    rare: '#5fb6ff',
    epic: '#aa44ff',
    legendary: '#ffd700',
  };

  get tierStats() {
    if (!this.stats) return [];
    return [
      { tier: 'common', count: this.stats.common_count || 0 },
      { tier: 'uncommon', count: this.stats.uncommon_count || 0 },
      { tier: 'rare', count: this.stats.rare_count || 0 },
      { tier: 'epic', count: this.stats.epic_count || 0 },
      { tier: 'legendary', count: this.stats.legendary_count || 0 },
    ];
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.totalCards / this.pageSize));
  }

  get displayCards(): any[] {
    const query = this.searchQuery.trim().toLowerCase();
    return (this.cards ?? []).filter((card) => {
      const matchesFavorites = !this.showFavoritesOnly || !!card.is_favorite;
      const matchesTier = !this.activeTier || card.card_tier === this.activeTier;
      const matchesSearch = !query || String(card.game_name ?? '').toLowerCase().includes(query);
      return matchesFavorites && matchesTier && matchesSearch;
    });
  }

  get pagedCards(): any[] {
    return this.displayCards;
  }

  onPageChange(page: number): void {
    this.page = page;
    this.pageChange.emit(page);
  }

  tierColor(tier: string): string {
    return this.tierColors[tier] || '#8c96a8';
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const placeholder = document.createElement('div');
    placeholder.style.cssText =
      'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-dark);font-size:28px;';
    placeholder.textContent = '🎮';
    img.parentElement?.appendChild(placeholder);
  }

  selectCard(card: any): void {
    if (this.selectedCard?.id === card.id) {
      this.clearTradeDraft();
      return;
    }
    this.selectedCard = card;
    this.clearFriendSelection();
    this.tradeMessage = null;
    this.tradeError = null;
    this.viewMode = 'details';
  }

  showCardDetails(): void {
    this.viewMode = 'details';
  }

  openTradeMode(mode: 'trade' | 'gift'): void {
    this.viewMode = 'trade';
    this.tradeMode = mode;
    if (mode === 'trade' && this.selectedFriend) {
      this.loadFriendCards(this.selectedFriend.id);
    }
  }

  setTradeMode(mode: 'trade' | 'gift'): void {
    this.tradeMode = mode;
    this.fairnessCheck = null;
    this.overrideUnfair = false;
    this.tradeMessage = null;
    this.tradeError = null;
    if (mode === 'gift') {
      this.selectedReceiverCard = null;
    } else if (this.selectedFriend) {
      this.loadFriendCards(this.selectedFriend.id);
    }
  }

  searchFriends(): void {
    const query = this.friendQuery.trim();
    this.tradeError = null;
    this.tradeMessage = null;
    this.selectedFriend = null;
    this.friendCards = [];
    this.selectedReceiverCard = null;
    this.fairnessCheck = null;
    this.overrideUnfair = false;

    if (query.length < 2) {
      this.friendResults = [];
      return;
    }

    this.friendSearching = true;
    this.chatService.searchUsers(query).subscribe({
      next: (users) => {
        this.friendResults = (users ?? []).map((user: any) => ({
          id: String(user.id),
          username: user.username,
          avatar: user.avatar ?? null,
          name: user.name ?? null,
        }));
        this.friendSearching = false;
      },
      error: () => {
        this.friendResults = [];
        this.friendSearching = false;
      },
    });
  }

  selectFriend(friend: TradeFriend): void {
    this.selectedFriend = friend;
    this.friendResults = [];
    this.friendQuery = friend.username;
    this.tradeError = null;
    this.tradeMessage = null;
    this.selectedReceiverCard = null;
    this.fairnessCheck = null;
    this.overrideUnfair = false;
    this.loadFriendCards(friend.id);
  }

  clearFriendSelection(): void {
    this.selectedFriend = null;
    this.friendCards = [];
    this.selectedReceiverCard = null;
    this.fairnessCheck = null;
    this.overrideUnfair = false;
  }

  selectReceiverCard(card: any): void {
    this.selectedReceiverCard = card;
    this.tradeError = null;
    this.tradeMessage = null;
    this.checkFairness();
  }

  clearTradeDraft(): void {
    this.selectedCard = null;
    this.tradeMode = 'trade';
    this.friendQuery = '';
    this.friendResults = [];
    this.friendSearching = false;
    this.selectedFriend = null;
    this.friendCards = [];
    this.friendCardsLoading = false;
    this.selectedReceiverCard = null;
    this.fairnessCheck = null;
    this.overrideUnfair = false;
    this.tradeBusy = false;
    this.tradeMessage = null;
    this.tradeError = null;
  }

  private loadFriendCards(userId: string): void {
    this.friendCardsLoading = true;
    this.chatService.getUserShowcase(userId).subscribe({
      next: (res) => {
        this.friendCards = res?.items ?? [];
        this.friendCardsLoading = false;
      },
      error: () => {
        this.friendCards = [];
        this.friendCardsLoading = false;
      },
    });
  }

  private getCardId(card: any): number | null {
    const id = card?.id ?? card?.card_id ?? card?.user_card_id ?? null;
    return typeof id === 'number' ? id : Number(id) || null;
  }

  private checkFairness(): void {
    if (!this.selectedCard || !this.selectedReceiverCard) return;
    const proposerCardId = this.getCardId(this.selectedCard);
    const receiverCardId = this.getCardId(this.selectedReceiverCard);
    if (!proposerCardId || !receiverCardId) return;

    this.chatService.checkTradeFairness([proposerCardId], [receiverCardId]).subscribe({
      next: (result) => {
        this.fairnessCheck = result;
        if (!result?.isFair) this.overrideUnfair = false;
      },
      error: () => {
        this.fairnessCheck = null;
      },
    });
  }

  submitTrade(): void {
    const proposerCardId = this.getCardId(this.selectedCard);
    const receiverCardId = this.getCardId(this.selectedReceiverCard);
    if (!proposerCardId || !receiverCardId || !this.selectedFriend) return;

    this.tradeBusy = true;
    this.tradeError = null;
    const allowUnfair = !!this.overrideUnfair || !!this.fairnessCheck?.isFair;

    this.chatService.createCardTrade([proposerCardId], this.selectedFriend.id, [receiverCardId], allowUnfair).subscribe({
      next: () => {
        this.tradeBusy = false;
        this.tradeMessage = 'Trade proposal sent.';
        this.startTrade.emit({
          type: 'trade',
          proposerCardId,
          receiverId: this.selectedFriend?.id,
          receiverCardId,
          allowUnfair,
        });
      },
      error: (err) => {
        this.tradeBusy = false;
        this.tradeError = err?.error?.message ?? 'Failed to send trade proposal.';
      },
    });
  }

  sendGift(): void {
    const cardId = this.getCardId(this.selectedCard);
    if (!cardId || !this.selectedFriend) return;

    this.tradeBusy = true;
    this.tradeError = null;
    this.chatService.giftCard(cardId, this.selectedFriend.id).subscribe({
      next: () => {
        this.tradeBusy = false;
        this.tradeMessage = 'Gift sent.';
        this.startTrade.emit({
          type: 'gift',
          gifterCardId: cardId,
          receiverId: this.selectedFriend?.id,
        });
      },
      error: (err) => {
        this.tradeBusy = false;
        this.tradeError = err?.error?.message ?? 'Failed to send gift.';
      },
    });
  }

  filterTier(tier: string | null): void {
    this.activeTier = tier;
    this.page = 1;
    this.pageChange.emit(1);
    this.tierFilter.emit(tier);
  }

  toggleFavoritesFilter(): void {
    this.showFavoritesOnly = !this.showFavoritesOnly;
    this.page = 1;
    this.pageChange.emit(1);
  }

  onSearch(): void {
    this.page = 1;
    this.pageChange.emit(1);
    this.searchChange.emit(this.searchQuery);
  }

  onSortChange(sort: string): void {
    this.sortBy = sort as 'newest' | 'name' | 'tier';
    this.sortDropdownOpen = false;
    this.page = 1;
    this.pageChange.emit(1);
    this.sortChange.emit(sort);
  }

  goPage(p: number): void {
    this.pageChange.emit(p);
  }
}
