import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { DrawCard } from '../../services/chat.service';

@Component({
  selector: 'app-card-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatIconModule],
  template: `
    <section class="collection-shell">
      <div class="collection-header">
        <div>
          <p class="collection-kicker">Arsenal</p>
          <h2 class="collection-title">MY COLLECTION</h2>
          <p class="collection-subtitle">Cards collected in your arsenal.</p>
        </div>
        <div class="collection-count-wrap">
          <span class="collection-count">{{ totalCards }} total cards</span>
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

      <!-- FILTERS -->
      <div class="filter-row">
        <button
          class="filter-btn filter-all"
          [class.active]="!activeTier"
          (click)="filterTier(null)"
        >
          All
        </button>
        <button
          class="filter-btn filter-favorites"
          [class.active]="showFavoritesOnly"
          (click)="toggleFavoritesFilter()"
        >
          <mat-icon>star</mat-icon>
          Favorites
        </button>
        @for (tier of tiers; track tier) {
          <button
            class="filter-btn"
            [class.active]="activeTier === tier"
            [ngClass]="'tier-' + tier"
            (click)="filterTier(tier)"
          >
            {{ tier }}
          </button>
        }
        <input
          class="filter-search"
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
          placeholder="Search cards..."
        />
      </div>

      <!-- CARD GRID -->
      <div class="card-grid">
        @for (card of displayCards; track card.game_code) {
          <mat-card
            class="owned-card"
            [class.recent-draw]="highlightGameCode === card.game_code"
            [ngClass]="'tier-' + card.card_tier"
            (click)="selectCard(card)"
          >
            <button
              class="card-fav"
              [class.active]="card.is_favorite"
              (click)="toggleFav.emit(card.game_code); $event.stopPropagation()"
            >
              <mat-icon>{{ card.is_favorite ? 'star' : 'star_border' }}</mat-icon>
            </button>
            <div class="card-media owned-media" [class.has-image]="!!card.cover_url">
              <div class="tier-badge" [ngClass]="'tier-' + card.card_tier">
                {{ card.card_tier }}
              </div>
              <img
                *ngIf="card.cover_url"
                class="cover-image"
                [src]="card.cover_url"
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

      /* ── TOTAL CARDS badge: no glow ── */
      .collection-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #0b0e16;
        background: linear-gradient(135deg, #5bd9ff, #ff4d84);
        font-weight: 900;
        box-shadow: none;
      }

      .collection-count.secondary {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(241, 247, 255, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: none;
      }

      /* ── STATS ROW ── */
      .stats-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 16px;
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
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 4px;
      }
      .tier-common {
        background: rgba(140, 150, 168, 0.15);
        color: #8c96a8;
        border: 1px solid rgba(140, 150, 168, 0.25);
      }
      .tier-uncommon {
        background: rgba(0, 230, 118, 0.1);
        color: #00e676;
        border: 1px solid rgba(0, 230, 118, 0.2);
      }
      .tier-rare {
        background: rgba(95, 182, 255, 0.1);
        color: #5fb6ff;
        border: 1px solid rgba(95, 182, 255, 0.2);
      }
      .tier-epic {
        background: rgba(170, 68, 255, 0.1);
        color: #aa44ff;
        border: 1px solid rgba(170, 68, 255, 0.2);
      }
      .tier-legendary {
        background: rgba(255, 215, 0, 0.15);
        color: #ffd700;
        border: 2px solid rgba(255, 215, 0, 0.4);
        box-shadow: none;
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
      }

      .filter-btn.filter-favorites {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .filter-btn.filter-favorites mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
        line-height: 16px;
      }

      /* "All" button — plain, no tier color */
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

      .filter-search::placeholder {
        color: rgba(241, 247, 255, 0.34);
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
export class CardCollectionComponent {
  @Input() cards: any[] = [];
  @Input() totalCards = 0;
  @Input() page = 1;
  @Input() pageSize = 24;
  @Input() stats: any = null;
  @Input() highlightGameCode: string | null = null;
  @Output() toggleFav = new EventEmitter<string>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() tierFilter = new EventEmitter<string | null>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() startTrade = new EventEmitter<any>();

  defaultCover = '';
  activeTier: string | null = null;
  showFavoritesOnly = false;
  searchQuery = '';
  selectedCard: any = null;
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
    return Math.ceil(this.totalCards / this.pageSize);
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
    this.selectedCard = card;
  }

  filterTier(tier: string | null): void {
    this.activeTier = tier;
    this.tierFilter.emit(tier);
  }

  toggleFavoritesFilter(): void {
    this.showFavoritesOnly = !this.showFavoritesOnly;
  }

  onSearch(): void {
    this.searchChange.emit(this.searchQuery);
  }

  goPage(p: number): void {
    this.pageChange.emit(p);
  }
}
