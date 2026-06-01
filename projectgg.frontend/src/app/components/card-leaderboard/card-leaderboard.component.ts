import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-card-leaderboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="lb-panel">
      <h2 class="lb-title">CARD LEADERBOARD</h2>
      @if (entries.length === 0) {
        <div class="lb-empty">No entries yet</div>
      } @else {
        <div class="lb-list">
          @for (entry of entries; track entry.user_id; let i = $index) {
            <div class="lb-row" [class.top-3]="i < 3">
              <span class="lb-rank" [class]="'rank-' + (i + 1)">{{ i + 1 }}</span>
              <img loading="lazy" decoding="async" [src]="entry.avatar || defaultCover" alt="" class="lb-avatar" (error)="onImgError($event)" />
              <div class="lb-info">
                <span class="lb-name">{{ entry.username }}</span>
                <span class="lb-sub">{{ entry.total_cards }} cards · {{ entry.legendary }} LEG · {{ entry.epic }} EPIC</span>
              </div>
              <span class="lb-xp">{{ entry.total_xp | number }} XP</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 16px; }
    .lb-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; letter-spacing: 1px; }
    .lb-empty { text-align: center; color: var(--text-muted); padding: 40px; }
    .lb-list { display: flex; flex-direction: column; gap: 6px; }
    .lb-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--bg-dark); border-radius: 8px; border: 1px solid var(--border-color); }
    .lb-row.top-3 { border-color: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3); }
    .lb-rank { width: 28px; font-size: 14px; font-weight: 900; text-align: center; color: var(--text-muted); }
    .lb-rank.rank-1 { color: #ffd700; }
    .lb-rank.rank-2 { color: #c0c0c0; }
    .lb-rank.rank-3 { color: #cd7f32; }
    .lb-avatar { width: 32px; height: 32px; border-radius: 50%; }
    .lb-info { flex: 1; display: flex; flex-direction: column; }
    .lb-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .lb-sub { font-size: 11px; color: var(--text-muted); }
    .lb-xp { font-size: 13px; font-weight: 700; color: var(--color-primary); }
  `],
})
export class CardLeaderboardComponent {
  @Input() entries: any[] = [];
  defaultCover = '';
  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-dark);border-radius:50%;font-size:18px;';
    placeholder.textContent = '👤';
    img.parentElement?.appendChild(placeholder);
  }
}
