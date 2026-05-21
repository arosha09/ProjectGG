import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { GamesService } from '../../services/games.service';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Game } from '../../models/game.model';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { CollectionButtonComponent } from '../../components/collection-button/collection-button.component';

type SeriesGroup = {
  name: string;
  games: Game[];
};

type LibraryItem = { type: 'game'; game: Game } | { type: 'series'; series: SeriesGroup };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  // Note: If using angular-tabler-icons, remember to add TablerIconsModule to imports here!
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    SkeletonComponent,
    CollectionButtonComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly pageSize = 12;
  readonly libraryPageSize = 10;
  readonly seriesPageSize = 10;

  currentUser: any = null;
  allGames: Game[] = [];
  userGames: Game[] = [];
  totalGames = 0;
  currentPage = 1;
  totalPages = 1;
  loading = true;
  error = '';
  currentTheme: 'green' | 'red' | 'yellow' | 'blue' = 'green';
  themeDropdownOpen = false;
  currentStatus: 'online' | 'away' | 'offline' | 'invisible' = 'online';
  statusDropdownOpen = false;
  expandedSeries = new Set<string>();
  seriesCurrentPages: Record<string, number> = {};
  libraryCurrentPage = 1;

  constructor(
    private readonly auth: AuthService,
    private readonly games: GamesService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadData();

    // apply persisted theme (if any)
    this.applySavedTheme();
    this.applySavedStatus();
  }

  setTheme(theme: 'green' | 'red' | 'yellow' | 'blue'): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false; // close dropdown after selection
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('projectgg:theme', theme);
    } catch (e) {
      console.warn('Could not persist theme:', e);
    }
  }

  private applySavedTheme(): void {
    try {
      const saved = localStorage.getItem('projectgg:theme') as any;
      if (saved === 'red' || saved === 'yellow' || saved === 'blue' || saved === 'green') {
        this.setTheme(saved);
      } else {
        this.setTheme(this.currentTheme);
      }
    } catch (e) {
      // ignore
    }
  }

  toggleThemeDropdown(): void {
    this.themeDropdownOpen = !this.themeDropdownOpen;
    this.statusDropdownOpen = false;
  }

  setStatus(status: 'online' | 'away' | 'offline' | 'invisible'): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    try {
      localStorage.setItem('projectgg:status', status);
    } catch (e) {
      console.warn('Could not persist status:', e);
    }
  }

  private applySavedStatus(): void {
    try {
      const saved = localStorage.getItem('projectgg:status') as any;
      if (saved === 'online' || saved === 'away' || saved === 'offline' || saved === 'invisible') {
        this.currentStatus = saved;
      }
    } catch (e) {
      // ignore
    }
  }

  toggleStatusDropdown(): void {
    this.statusDropdownOpen = !this.statusDropdownOpen;
    this.themeDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const themeDropdown = document.querySelector('.theme-dropdown');
    const statusDropdown = document.querySelector('.status-dropdown');
    if (themeDropdown && !themeDropdown.contains(target)) {
      this.themeDropdownOpen = false;
    }
    if (statusDropdown && !statusDropdown.contains(target)) {
      this.statusDropdownOpen = false;
    }
  }

  getThemeColor(theme: string): string {
    const colors: Record<string, string> = {
      green: '#00ff99',
      red: '#ff5f6d',
      yellow: '#ffd24d',
      blue: '#5fb6ff',
    };
    return colors[theme] || colors['green'];
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      online: '#00ff99',
      away: '#ffd24d',
      offline: '#8c96a8',
      invisible: '#b36bff',
    };
    return colors[status] || colors['online'];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadData(): void {
    this.loading = true;
    this.error = '';

    this.games
      .getAllGames(1, 1000)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (games) => {
          this.allGames = games ?? [];
          this.totalGames = games?.[0]?.total_count ?? games?.length ?? 0;
          this.totalPages = this.totalLibraryPages;
          if (this.libraryCurrentPage > this.totalLibraryPages) {
            this.libraryCurrentPage = this.totalLibraryPages;
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading games:', err);
          this.error = 'Failed to load the game feed.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });

    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (userId) {
      this.games
        .getUserGames(String(userId), this.currentPage, this.pageSize)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (games) => {
            this.userGames = games ?? [];
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('Error loading user games:', err);
            this.userGames = [];
            this.cdr.markForCheck();
          },
        });
    }
  }

  addGame(gameCode: string): void {
    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (!userId) return;

    // Optimistic update: mutate userGames locally so the library grid is never torn down.
    const game = this.allGames.find((g) => g.code === gameCode);
    if (game && !this.isAdded(gameCode)) {
      this.userGames = [...this.userGames, game];
      this.cdr.markForCheck();
    }

    this.games
      .addGameToUser(String(userId), gameCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.refreshUserGames(String(userId)),
        error: () => {
          // Roll back on failure
          this.userGames = this.userGames.filter((g) => g.code !== gameCode);
          this.cdr.markForCheck();
        },
      });
  }

  removeGame(gameCode: string): void {
    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (!userId) return;

    // Optimistic update: remove locally so the library grid is never torn down.
    const previous = this.userGames;
    this.userGames = this.userGames.filter((g) => g.code !== gameCode);
    this.cdr.markForCheck();

    this.games
      .removeGameFromUser(String(userId), gameCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.refreshUserGames(String(userId)),
        error: () => {
          // Roll back on failure
          this.userGames = previous;
          this.cdr.markForCheck();
        },
      });
  }

  private refreshUserGames(userId: string): void {
    // Only re-fetches userGames — never touches allGames,
    // so the library grid is never destroyed and rebuilt.
    this.games
      .getUserGames(userId, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (games) => {
          this.userGames = games ?? [];
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Error refreshing user games:', err),
      });
  }

  get seriesGroups(): SeriesGroup[] {
    const grouped = new Map<string, Game[]>();

    for (const game of this.allGames) {
      if (!game.series_name) {
        continue;
      }

      const existing = grouped.get(game.series_name) ?? [];
      existing.push(game);
      grouped.set(game.series_name, existing);
    }

    return [...grouped.entries()]
      .map(([name, games]) => ({
        name,
        games: [...games].sort((left, right) => {
          const leftSequence =
            left.sequence_timeline ?? left.sequence_release ?? Number.MAX_SAFE_INTEGER;
          const rightSequence =
            right.sequence_timeline ?? right.sequence_release ?? Number.MAX_SAFE_INTEGER;

          if (leftSequence !== rightSequence) {
            return leftSequence - rightSequence;
          }

          return left.name.localeCompare(right.name);
        }),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  get libraryItems(): LibraryItem[] {
    const standaloneItems: LibraryItem[] = this.allGames
      .filter((game) => !game.series_name)
      .map((game) => ({ type: 'game', game }));

    const seriesItems: LibraryItem[] = this.seriesGroups.map((series) => ({
      type: 'series',
      series,
    }));

    return [...standaloneItems, ...seriesItems].sort((left, right) => {
      const leftName = left.type === 'game' ? left.game.name : left.series.name;
      const rightName = right.type === 'game' ? right.game.name : right.series.name;
      return leftName.localeCompare(rightName);
    });
  }

  get pagedLibraryItems(): LibraryItem[] {
    const startIndex = (this.libraryCurrentPage - 1) * this.libraryPageSize;
    return this.libraryItems.slice(startIndex, startIndex + this.libraryPageSize);
  }

  get totalLibraryPages(): number {
    return Math.max(1, Math.ceil(this.libraryItems.length / this.libraryPageSize));
  }

  get visibleExpandedSeriesGroups(): SeriesGroup[] {
    return this.pagedLibraryItems
      .filter((item): item is { type: 'series'; series: SeriesGroup } => item.type === 'series')
      .map((item) => item.series)
      .filter((series) => this.isSeriesExpanded(series.name));
  }

  trackByLibraryItem(index: number, item: LibraryItem): string {
    if (item.type === 'game') {
      return `game-${item.game.code}`;
    }
    return `series-${item.series.name}`;
  }

  goToLibraryPage(page: number): void {
    const boundedPage = Math.max(1, Math.min(page, this.totalLibraryPages));
    if (boundedPage === this.libraryCurrentPage) {
      return;
    }
    this.libraryCurrentPage = boundedPage;
  }

  isSeriesExpanded(seriesName: string): boolean {
    return this.expandedSeries.has(seriesName);
  }

  toggleSeries(seriesName: string): void {
    if (this.expandedSeries.has(seriesName)) {
      this.expandedSeries.delete(seriesName);
      return;
    }

    this.expandedSeries.add(seriesName);
    if (!this.seriesCurrentPages[seriesName]) {
      this.seriesCurrentPages[seriesName] = 1;
    }
  }

  toggleSeriesFromButton(event: Event, seriesName: string): void {
    event.stopPropagation();
    this.toggleSeries(seriesName);
  }

  getSeriesTotalPages(group: SeriesGroup): number {
    return Math.max(1, Math.ceil(group.games.length / this.seriesPageSize));
  }

  getSeriesCurrentPage(group: SeriesGroup): number {
    return this.seriesCurrentPages[group.name] ?? 1;
  }

  getSeriesPageGames(group: SeriesGroup): Game[] {
    const page = this.getSeriesCurrentPage(group);
    const startIndex = (page - 1) * this.seriesPageSize;
    return group.games.slice(startIndex, startIndex + this.seriesPageSize);
  }

  goToSeriesPage(group: SeriesGroup, page: number): void {
    const boundedPage = Math.max(1, Math.min(page, this.getSeriesTotalPages(group)));
    this.seriesCurrentPages[group.name] = boundedPage;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }

    this.currentPage = page;
    this.goToLibraryPage(page);
  }

  isAdded(gameCode: string): boolean {
    return this.userGames.some((game) => game.code === gameCode);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }

  getLevel(): number {
    return Math.max(1, Math.min(99, this.userGames.length * 7 + 1));
  }

  hideBrokenCover(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.style.display = 'none';
    }
  }
}
