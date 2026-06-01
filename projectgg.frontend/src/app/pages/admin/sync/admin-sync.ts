import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { GamesService, SyncResult } from '../../../services/games.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-admin-sync',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatCheckboxModule, MatButtonModule, MatInputModule],
  templateUrl: './admin-sync.html',
  styleUrls: ['./admin-sync.scss'],
})
export class AdminSync {
  syncing = false;
  scanning = false;
  queue: { code: string; name: string; missing: string[]; locked_columns?: string[]; currentSync?: SyncResult }[] = [];
  completed = 0;
  total = 0;
  current = '';
  status = '';
  results: SyncResult[] = [];
  showQueue = false;
  searchQuery = '';
  selectedCodes = new Set<string>();
  isForce = false;
  stopSync = false;
  syncComplete = false;
  scanPageSize = 200;
  showDetail = new Set<string>();
  missingSeries: string[] = [];
  fileMap: Map<string, File | null> = new Map();
  uploadStatus: Map<string, string> = new Map();
  currentSyncingDetail = '';

  constructor(
    private readonly games: GamesService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get currentUser(): any {
    return this.auth.getCurrentUser();
  }

  loadMissingSeries(): void {
    this.status = 'Loading missing series...';
    this.games.getMissingSeries().subscribe({
      next: (list) => {
        this.missingSeries = list;
        for (const s of list) this.fileMap.set(s, null);
        this.status = `Found ${list.length} missing series`;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.status = `Failed to load missing series: ${err.message}`;
        this.cdr.detectChanges();
      }
    });
  }

  onSeriesFileChange(series: string, ev: any): void {
    const f = ev?.target?.files?.[0] ?? null;
    if (f) this.fileMap.set(series, f);
    this.cdr.detectChanges();
  }

  uploadSeries(series: string): void {
    const file = this.fileMap.get(series) ?? null;
    if (!file) { this.uploadStatus.set(series, 'No file selected'); return; }
    this.uploadStatus.set(series, 'Uploading...');
    this.games.uploadSeriesCover(series, file).subscribe({
      next: () => {
        this.uploadStatus.set(series, 'Uploaded');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.uploadStatus.set(series, `Error: ${err.message}`);
        this.cdr.detectChanges();
      }
    });
  }

  uploadAllMissing(): void {
    for (const s of this.missingSeries) {
      const file = this.fileMap.get(s);
      if (file) this.uploadSeries(s);
    }
  }

  getFileName(series: string): string {
    const f = this.fileMap.get(series) ?? null;
    return f ? f.name : 'No file chosen';
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get filteredQueue(): { code: string; name: string; missing: string[]; locked_columns?: string[] }[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.queue;
    return this.queue.filter(g =>
      g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)
    );
  }

  toggleDetail(code: string): void {
    if (this.showDetail.has(code)) {
      this.showDetail.delete(code);
    } else {
      this.showDetail.add(code);
    }
  }

  get hasSelection(): boolean {
    return this.selectedCodes.size > 0;
  }

  scanAllGames(): void {
    this.syncComplete = false;
    this.scanning = true;
    this.selectedCodes.clear();
    this.status = 'Loading all games...';
    this.showQueue = false;
    this.cdr.detectChanges();

    const pageSize = this.scanPageSize || 200;
    this.games.getAllGames(1, pageSize).subscribe({
      next: (first) => {
        const total = first[0]?.total_count ?? 0;
        this.queue = first.map(g => ({ code: g.code, name: g.name, missing: [], locked_columns: (g as any).locked_columns ?? [] }));
        this.status = `Loading games... ${this.queue.length} / ${total}`;
        this.cdr.detectChanges();

        if (total <= pageSize) {
          this.showQueue = true;
          this.scanning = false;
          this.status = `Loaded ${this.queue.length} games`;
          this.cdr.detectChanges();
          return;
        }

        const totalPages = Math.ceil(total / pageSize);
        this.loadPage(2, totalPages, total);
      },
      error: (err) => {
        this.status = `Failed to load games: ${err.message}`;
        this.scanning = false;
        this.cdr.detectChanges();
      },
    });
  }

  private loadPage(page: number, totalPages: number, total: number): void {
    this.games.getAllGames(page, this.scanPageSize || 200).subscribe({
      next: (more) => {
        this.queue = [...this.queue, ...more.map(g => ({ code: g.code, name: g.name, missing: [], locked_columns: (g as any).locked_columns ?? [] }))];
        this.status = `Loading games... ${this.queue.length} / ${total}`;
        this.cdr.detectChanges();

        if (page >= totalPages) {
          this.showQueue = true;
          this.scanning = false;
          this.status = `Loaded ${this.queue.length} games`;
          this.cdr.detectChanges();
        } else {
          this.loadPage(page + 1, totalPages, total);
        }
      },
      error: () => {
        this.status = `Loading games... ${this.queue.length} / ${total} (page ${page} failed)`;
        this.cdr.detectChanges();
        if (page >= totalPages) {
          this.showQueue = true;
          this.scanning = false;
          this.status = `Loaded ${this.queue.length} games`;
          this.cdr.detectChanges();
        } else {
          this.loadPage(page + 1, totalPages, total);
        }
      },
    });
  }

  loadQueue(force: boolean = false, brokenOnly: boolean = false): void {
    this.syncComplete = false;
    this.isForce = force;
    this.scanning = true;
    this.selectedCodes.clear();
    this.status = force ? 'Scanning all games...' : brokenOnly ? 'Scanning broken games...' : 'Scanning game database...';
    this.cdr.detectChanges();
    this.games.getSyncQueue(force, undefined, brokenOnly).subscribe({
      next: (q: any[]) => {
        this.queue = q.map((g: any) => ({ code: g.code, name: g.name, missing: g.missing ?? [], locked_columns: g.locked_columns ?? [] }));
        this.showQueue = true;
        this.scanning = false;
        this.status = q.length > 0 ? `Found ${q.length} games` : 'All games are synced!';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.status = `Failed to load queue: ${err.message}`;
        this.scanning = false;
        this.cdr.detectChanges();
      },
    });
  }

  scanBroken(): void {
    this.loadQueue(false, true);
  }

  toggleColumnLock(game: { code: string; name: string; missing: string[]; locked_columns?: string[] }, column: string): void {
    const locked = game.locked_columns ?? [];
    const isLocked = locked.includes(column);
    const obs = isLocked
      ? this.games.unlockColumn(game.code, column)
      : this.games.lockColumn(game.code, column);
    obs.subscribe({
      next: (res) => {
        game.locked_columns = res.locked_columns;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(`Failed to toggle lock on ${game.code}/${column}:`, err);
      },
    });
  }

  toggleSelect(code: string): void {
    if (this.selectedCodes.has(code)) {
      this.selectedCodes.delete(code);
    } else {
      this.selectedCodes.add(code);
    }
  }

  selectAll(): void {
    for (const g of this.filteredQueue) {
      this.selectedCodes.add(g.code);
    }
  }

  deselectAll(): void {
    this.selectedCodes.clear();
  }

  startSync(): void {
    if (this.syncing) return;
    const syncQueue = this.hasSelection
      ? this.queue.filter(g => this.selectedCodes.has(g.code))
      : this.queue;
    if (syncQueue.length === 0) return;
    this.syncing = true;
    this.completed = 0;
    this.results = [];
    this.queue = syncQueue;
    this.total = syncQueue.length;
    this.status = `Starting sync of ${this.total} games...`;
    this.processNext(0);
  }

  cancelSync(): void {
    this.stopSync = true;
    this.status = 'Stopping after current game...';
  }

  private processNext(index: number): void {
    if (this.stopSync || index >= this.queue.length) {
      this.syncing = false;
      this.stopSync = false;
      if (index >= this.queue.length) {
        this.syncComplete = true;
        this.status = 'Sync complete!';
      } else {
        this.status = 'Sync stopped.';
      }
      this.cdr.detectChanges();
      return;
    }

    const game = this.queue[index];
    this.current = game.code;
    this.currentSyncingDetail = '';
    this.status = `[${index + 1}/${this.total}] Syncing ${game.name} (${game.code})...`;
    this.cdr.detectChanges();

    this.games.syncGame(game.code, game.name).subscribe({
      next: (result: SyncResult) => {
        const syncResult: SyncResult = {
          code: game.code,
          success: result.success,
          message: result.message,
          source: result.source || this.extractSource(result.message),
          rating: result.rating,
        };
        this.results.push(syncResult);
        this.completed = index + 1;
        this.cdr.detectChanges();
        setTimeout(() => this.processNext(index + 1), 500);
      },
      error: (err: any) => {
        const syncResult: SyncResult = {
          code: game.code,
          success: false,
          message: err.message,
        };
        this.results.push(syncResult);
        this.completed = index + 1;
        this.cdr.detectChanges();
        setTimeout(() => this.processNext(index + 1), 500);
      },
    });
  }

  private extractSource(message: string): string {
    const sources = ['steam', 'rawg', 'gog', 'epic', 'steamgriddb'];
    const lower = message.toLowerCase();
    for (const s of sources) {
      if (lower.includes(s)) return s;
    }
    return 'unknown';
  }

  getFieldDetails(result: SyncResult): string {
    if (!result.success) return result.message;
    const parts: string[] = [];
    if (result.message?.includes('cover')) parts.push('cover');
    if (result.message?.includes('rating')) parts.push('rating');
    if (result.message?.includes('RAWG')) parts.push('RAWG rating');
    if (result.message?.includes('genres')) parts.push('genres');
    if (result.message?.includes('platforms')) parts.push('platforms');
    return parts.length > 0 ? parts.join(', ') : result.message;
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
