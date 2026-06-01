import { Component, input, output, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';

export interface SearchResult {
  id: number;
  name: string;
  cover_url?: string;
  source?: string;
  release_year?: number;
  genres?: string[];
  rating?: number;
  desc?: string;
  platforms: string[];
  sources: string[];
}

@Component({
  selector: 'app-game-search-result',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCheckboxModule],
  templateUrl: './game-search-result.component.html',
  styleUrls: ['./game-search-result.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class GameSearchResultComponent {
  readonly result = input.required<SearchResult>();
  readonly selected = input(false);
  readonly importing = input(false);
  readonly selectionChange = output<void>();
  readonly importGame = output<void>();
}
