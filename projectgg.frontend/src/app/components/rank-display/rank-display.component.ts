import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { UserRankDto } from '../../models/rank.model';

@Component({
  selector: 'app-rank-display',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: './rank-display.component.html',
  styleUrls: ['./rank-display.component.scss'],
})
export class RankDisplayComponent {
  readonly userRank = input.required<UserRankDto | null>();
  readonly compact = input(false);

  get rankImageUrl(): string {
    const rank = this.userRank();
    if (!rank) return '';
    return rank.rank_image_url || '';
  }

  get xpLabel(): string {
    const rank = this.userRank();
    if (!rank) return '-- XP';
    if (rank.next_rank_code === 'MAX') return `${rank.total_xp} XP — MAX RANK`;
    return `${rank.total_xp} XP — ${rank.xp_to_next} to next`;
  }
}
