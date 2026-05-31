import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-card-trading',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="trading-panel">
      <h2 class="panel-title">TRADES</h2>
      @if (trades.length === 0) {
        <div class="empty-state">
          <mat-icon>swap_horiz</mat-icon>
          <p>No pending trades</p>
        </div>
      } @else {
        @for (trade of trades; track trade.trade_id) {
          <div class="trade-card">
            <div class="trade-parties">
              <div class="trade-user">
                <img [src]="trade.proposer_avatar || defaultCover" alt="" class="trade-avatar" (error)="onImgError($event)" />
                <span class="trade-name">{{ trade.proposer_name }}</span>
              </div>
              <mat-icon class="trade-arrow">swap_horiz</mat-icon>
              <div class="trade-user">
                <span class="trade-name">You</span>
              </div>
            </div>
            <div class="trade-cards">
              <div class="trade-card-item" [style.border-color]="tierColor(trade.proposer_tier)">
                <img [src]="trade.proposer_cover || defaultCover" alt="" class="trade-card-img" (error)="onImgError($event)" />
                <span class="trade-card-tier" [style.color]="tierColor(trade.proposer_tier)">{{ trade.proposer_tier }}</span>
              </div>
              <div class="trade-card-item" [style.border-color]="tierColor(trade.receiver_tier)">
                <img [src]="trade.receiver_cover || defaultCover" alt="" class="trade-card-img" (error)="onImgError($event)" />
                <span class="trade-card-tier" [style.color]="tierColor(trade.receiver_tier)">{{ trade.receiver_tier }}</span>
              </div>
            </div>
            <div class="trade-actions">
              @if (trade.proposer_id !== currentUserId) {
                <button class="trade-btn accept" (click)="accept.emit(trade.trade_id)"><mat-icon>check</mat-icon> Accept</button>
                <button class="trade-btn reject" (click)="reject.emit(trade.trade_id)"><mat-icon>close</mat-icon> Reject</button>
              } @else {
                <span class="trade-pending">Awaiting response</span>
                <button class="trade-btn cancel" (click)="cancel.emit(trade.trade_id)"><mat-icon>cancel</mat-icon> Cancel</button>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 16px; }
    .panel-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; letter-spacing: 1px; }
    .empty-state { text-align: center; color: var(--text-muted); padding: 40px; }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px; }
    .trade-card { background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
    .trade-parties { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px; }
    .trade-user { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .trade-avatar { width: 36px; height: 36px; border-radius: 50%; }
    .trade-name { font-size: 12px; color: var(--text-secondary); }
    .trade-arrow { color: var(--text-muted); }
    .trade-cards { display: flex; justify-content: center; gap: 16px; margin-bottom: 12px; }
    .trade-card-item { width: 80px; border-radius: 6px; overflow: hidden; border: 2px solid; }
    .trade-card-img { width: 100%; aspect-ratio: 3/4; object-fit: cover; }
    .trade-card-tier { display: block; text-align: center; font-size: 10px; font-weight: 700; text-transform: capitalize; padding: 2px; background: var(--bg-black); }
    .trade-actions { display: flex; justify-content: center; gap: 8px; align-items: center; }
    .trade-btn { display: flex; align-items: center; gap: 4px; padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-family: inherit; font-weight: 600; }
    .trade-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .trade-btn.accept { background: #00e676; color: #000; }
    .trade-btn.reject { background: #ff1744; color: #fff; }
    .trade-btn.cancel { background: var(--border-subtle); color: var(--text-secondary); }
    .trade-pending { font-size: 12px; color: var(--text-muted); }
  `],
})
export class CardTradingComponent {
  @Input() trades: any[] = [];
  @Input() currentUserId = '';
  @Output() accept = new EventEmitter<number>();
  @Output() reject = new EventEmitter<number>();
  @Output() cancel = new EventEmitter<number>();

  defaultCover = '';
  readonly tierColors: Record<string, string> = { common: '#8c96a8', uncommon: '#00e676', rare: '#5fb6ff', epic: '#aa44ff', legendary: '#ffd700' };
  tierColor(tier: string): string { return this.tierColors[tier] || '#8c96a8'; }
  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-dark);font-size:24px;';
    placeholder.textContent = '🎮';
    img.parentElement?.appendChild(placeholder);
  }
}
