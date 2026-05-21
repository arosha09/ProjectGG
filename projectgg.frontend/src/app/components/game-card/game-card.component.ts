import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { Game } from '../../models/game.model';
import { CollectionButtonComponent } from '../collection-button/collection-button.component';

@Component({
  selector: 'app-game-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, CollectionButtonComponent],
  templateUrl: './game-card.component.html',
  styleUrls: ['./game-card.component.scss'],
})
export class GameCardComponent {
  readonly game = input.required<Game>();
  readonly isAdded = input(false);
  readonly isSeries = input(false);
  readonly seriesCount = input(0);
  readonly seriesOrder = input<{ timeline?: number | null; release?: number | null } | null>(null);
  readonly mode = input<'add' | 'remove'>('add');
  readonly label = input<string | null>(null);
  readonly action = output<void>();

  hideBrokenCover(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }
}
