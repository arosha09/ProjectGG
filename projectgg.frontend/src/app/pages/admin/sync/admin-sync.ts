import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GamesService } from '../../../services/games.service';
import { AuthService } from '../../../services/auth.service';
import { AdminNavComponent } from '../../../components/admin-nav/admin-nav.component';

@Component({
  selector: 'app-admin-sync',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, AdminNavComponent],
  templateUrl: './admin-sync.html',
  styleUrls: ['./admin-sync.scss'],
})
export class AdminSync {
  syncing = false;
  scanning = false;
  queue: { code: string; name: string }[] = [];
  completed = 0;
  total = 0;
  current = '';
  status = '';
  results: { code: string; success: boolean; message: string }[] = [];
  showQueue = false;

  constructor(
    private readonly games: GamesService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get currentUser(): any {
    return this.auth.getCurrentUser();
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  loadQueue(): void {
    this.scanning = true;
    this.status = 'Scanning game database...';
    this.cdr.detectChanges();
    this.games.getSyncQueue().subscribe({
      next: (q) => {
        this.queue = q;
        this.showQueue = true;
        this.scanning = false;
        this.status = q.length > 0 ? `Found ${q.length} unsynced games` : 'All games are synced!';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.status = `Failed to load queue: ${err.message}`;
        this.scanning = false;
        this.cdr.detectChanges();
      },
    });
  }

  startSync(): void {
    if (this.syncing) return;
    this.syncing = true;
    this.completed = 0;
    this.results = [];
    this.status = 'Loading sync queue...';

    this.games.getSyncQueue().subscribe({
      next: (q) => {
        this.queue = q;
        this.total = q.length;
        if (this.total === 0) {
          this.status = 'All games are already synced!';
          this.syncing = false;
          return;
        }
        this.status = `Starting sync of ${this.total} games...`;
        this.processNext(0);
      },
      error: (err) => {
        this.status = `Error: ${err.message}`;
        this.syncing = false;
      },
    });
  }

  private processNext(index: number): void {
    if (index >= this.queue.length) {
      this.status = 'Sync complete!';
      this.syncing = false;
      this.cdr.detectChanges();
      return;
    }

    const game = this.queue[index];
    this.current = game.code;
    this.status = `[${index + 1}/${this.total}] Syncing ${game.name} (${game.code})...`;
    this.cdr.detectChanges();

    this.games.syncGame(game.code, game.name).subscribe({
      next: (result) => {
        this.results.push(result);
        this.completed = index + 1;
        this.cdr.detectChanges();
        setTimeout(() => this.processNext(index + 1), 500);
      },
      error: (err) => {
        this.results.push({ code: game.code, success: false, message: err.message });
        this.completed = index + 1;
        this.cdr.detectChanges();
        setTimeout(() => this.processNext(index + 1), 500);
      },
    });
  }

  get progressPercent(): number {
    if (this.total === 0) return 0;
    return Math.round((this.completed / this.total) * 100);
  }

  get successCount(): number {
    return this.results.filter((r) => r.success).length;
  }

  get failCount(): number {
    return this.results.filter((r) => !r.success).length;
  }
}
