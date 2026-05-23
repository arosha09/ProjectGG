import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../../services/auth.service';
import { GamesService } from '../../../services/games.service';
import { AdminNavComponent } from '../../../components/admin-nav/admin-nav.component';
import { GameSearchResultComponent } from '../../../components/game-search-result/game-search-result.component';
import { StatusMessageComponent } from '../../../components/status-message/status-message.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatCheckboxModule, AdminNavComponent, GameSearchResultComponent, StatusMessageComponent],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss'],
})
export class AdminDashboard {
  searchQuery = '';
  searchResults: any[] = [];
  searching = false;
  error = '';
  importing = new Set<number>();
  importLog: string[] = [];
  selectedIds = new Set<number>();

  constructor(
    private readonly auth: AuthService,
    private readonly games: GamesService,
    private readonly cdr: ChangeDetectorRef,
  ) {
  }

  get currentUser(): any {
    return this.auth.getCurrentUser();
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  onSearch(): void {
    const q = this.searchQuery.trim();
    this.selectedIds.clear();
    this.error = '';
    if (q.length < 2) return;
    this.searchResults = [];
    this.doSearch(q);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.selectedIds.clear();
    this.error = '';
  }

  private doSearch(q: string): void {
    this.searching = true;
    this.games.searchExternal(q).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.searching = false;
        if (results.length === 0) {
          this.error = 'ERROR-404 Not found';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.searching = false;
        this.error = 'ERROR-404 Not found';
        this.cdr.markForCheck();
      },
    });
  }

  toggleSelect(id: number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  importGame(result: any): void {
    const key = result.id;
    if (this.importing.has(key)) return;
    this.importing.add(key);

    this.games.importGame({
      name: result.name,
      cover_url: result.cover_url,
      genres: result.genres,
      external_id: String(result.id),
      rating: result.rating ?? null,
      release_year: result.release_year || null,
      desc: result.desc || null,
      platforms: result.platforms || ['pc'],
      sources: result.sources || [result.source || 'pc'],
    }).subscribe({
      next: () => {
        this.importLog.push(`✓ ${result.name} imported`);
        this.importing.delete(key);
      },
      error: (err) => {
        this.importLog.push(`✗ ${result.name} — ${err.error?.message || err.message}`);
        this.importing.delete(key);
      },
    });
  }

  importSelected(): void {
    for (const result of this.searchResults) {
      if (this.selectedIds.has(result.id) && !this.importing.has(result.id)) {
        this.importGame(result);
      }
    }
  }

  importAll(): void {
    for (const result of this.searchResults) {
      if (!this.importing.has(result.id)) {
        this.selectedIds.add(result.id);
        this.importGame(result);
      }
    }
  }
}
