import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { GamesService } from '../../services/games.service';
import { FormsModule } from '@angular/forms';
import { Game } from '../../models/game.model';
import { environment } from '../../../environments/environment';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { GameCardComponent } from '../../components/game-card/game-card.component';
import { PaginatorComponent } from '../../components/paginator/paginator.component';
import { HeaderNavComponent } from '../../components/header-nav/header-nav.component';
import { DropdownComponent, DropdownOption } from '../../components/dropdown/dropdown.component';
import { MusicPlayerComponent } from '../../components/music-player/music-player.component';
import { ThemeOption } from '../../components/theme-selector/theme-selector.component';
import { StatusOption } from '../../components/status-selector/status-selector.component';

type SeriesGroup = {
  name: string;
  games: Game[];
};

type LibraryItem = { type: 'game'; game: Game } | { type: 'series'; series: SeriesGroup };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    SkeletonComponent,
    GameCardComponent,
    PaginatorComponent,
    HeaderNavComponent,
    DropdownComponent,
    MusicPlayerComponent,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly pageSize = 12;
  readonly libraryPageSize = 12;
  readonly seriesPageSize = 12;

  currentUser: any = null;
  allGames: Game[] = [];
  userGames: Game[] = [];
  totalGames = 0;
  currentPage = 1;
  totalPages = 1;
  loading = true;
  error = '';
  currentTheme: 'green' | 'red' | 'yellow' | 'blue' = 'green';
  currentStatus: 'online' | 'away' | 'offline' | 'invisible' = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;
  expandedSeries = new Set<string>();
  seriesCurrentPages: Record<string, number> = {};
  libraryCurrentPage = 1;
  searchQuery = '';
  searchResults: Game[] | null = null;
  searching = false;
  sortOption: 'name' | 'release' | 'timeline' = 'name';

  readonly sortOptions: DropdownOption[] = [
    { value: 'name', label: 'Name' },
    { value: 'release', label: 'Release Order' },
    { value: 'timeline', label: 'Timeline Order' },
  ];

  // Discord CTA
  discordConnected = false;
  connectionsLoaded = false;
  musicConnections: any[] = [];
  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly auth: AuthService,
    private readonly games: GamesService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadData();
    this.loadConnections();
    this.applySavedTheme();
    this.applySavedStatus();
  }

  setTheme(theme: 'green' | 'red' | 'yellow' | 'blue'): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false;
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
    this.profileDropdownOpen = false;
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
    this.profileDropdownOpen = false;
  }

  onSortChange(newSort: string): void {
  if (newSort === 'name' || newSort === 'release' || newSort === 'timeline') {
    this.sortOption = newSort as 'name' | 'release' | 'timeline';
    this.libraryCurrentPage = 1;
    this.cdr.markForCheck(); // If using ChangeDetectionStrategy.OnPush
  }
}

  toggleProfileDropdown(): void {
    this.profileDropdownOpen = !this.profileDropdownOpen;
    this.themeDropdownOpen = false;
    this.statusDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const themeEl = document.querySelector('app-theme-selector');
    const statusEl = document.querySelector('app-status-selector');
    const navEl = document.querySelector('app-header-nav');
    if (themeEl && !themeEl.contains(target)) {
      this.themeDropdownOpen = false;
    }
    if (statusEl && !statusEl.contains(target)) {
      this.statusDropdownOpen = false;
    }
    if (navEl && !navEl.contains(target)) {
      this.profileDropdownOpen = false;
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

  private loadConnections(): void {
    this.http.get<any[]>(`${this.apiUrl}/platform/connections`).subscribe({
      next: (conns) => {
        this.discordConnected = conns.some(c => c.platform === 'discord');
        this.connectionsLoaded = true;
        this.musicConnections = conns.filter(c =>
          ['spotify', 'youtube_music', 'apple_music'].includes(c.platform)
        );
        this.cdr.markForCheck();
      },
      error: () => { this.connectionsLoaded = true; },
    });
  }

  linkDiscord(): void {
    this.router.navigate(['/settings'], { queryParams: { highlight: 'discord' } });
  }

  getPlatformLogo(id: string): string {
    const slugs: Record<string, string> = { steam: 'steam', discord: 'discord', gog: 'gogdotcom', epic: 'epicgames', ubisoft: 'ubisoft', ea: 'ea', spotify: 'spotify', youtube_music: 'youtubemusic', apple_music: 'applemusic' };
    return `https://cdn.simpleicons.org/${slugs[id] ?? id}/ffffff`;
  }

  addGame(gameCode: string): void {
    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (!userId) return;

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
          this.userGames = this.userGames.filter((g) => g.code !== gameCode);
          this.cdr.markForCheck();
        },
      });
  }

  removeGame(gameCode: string): void {
    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (!userId) return;

    const previous = this.userGames;
    this.userGames = this.userGames.filter((g) => g.code !== gameCode);
    this.cdr.markForCheck();

    this.games
      .removeGameFromUser(String(userId), gameCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.refreshUserGames(String(userId)),
        error: () => {
          this.userGames = previous;
          this.cdr.markForCheck();
        },
      });
  }

  private refreshUserGames(userId: string): void {
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

  onSearchInput(): void {
    const q = this.searchQuery.trim();
    if (!q) {
      this.searchResults = null;
      this.searching = false;
      this.libraryCurrentPage = 1;
      return;
    }
    this.searching = true;
    this.games.searchGames(q, 1, 100).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.searching = false;
        this.libraryCurrentPage = 1;
        this.cdr.markForCheck();
      },
      error: () => {
        this.searching = false;
        this.cdr.markForCheck();
      },
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = null;
    this.libraryCurrentPage = 1;
  }

  get sortedLibraryItems(): LibraryItem[] {
    const items = this.searchResults
      ? this.searchResults.map((game) => ({ type: 'game' as const, game }))
      : this.libraryItems;

    return [...items].sort((a, b) => {
      const aName = a.type === 'game' ? a.game.name : a.series.name;
      const bName = b.type === 'game' ? b.game.name : b.series.name;

      if (this.sortOption === 'release') {
        const aRel = a.type === 'game' ? (a.game.sequence_release ?? 9999) : 9999;
        const bRel = b.type === 'game' ? (b.game.sequence_release ?? 9999) : 9999;
        if (aRel !== bRel) return aRel - bRel;
        return aName.localeCompare(bName);
      }

      if (this.sortOption === 'timeline') {
        const aTim = a.type === 'game' ? (a.game.sequence_timeline ?? 9999) : 9999;
        const bTim = b.type === 'game' ? (b.game.sequence_timeline ?? 9999) : 9999;
        if (aTim !== bTim) return aTim - bTim;
        return aName.localeCompare(bName);
      }

      return aName.localeCompare(bName);
    });
  }

  get filteredLibraryItems(): LibraryItem[] {
    return this.sortedLibraryItems;
  }

  get pagedLibraryItems(): LibraryItem[] {
    const items = this.filteredLibraryItems;
    const start = (this.libraryCurrentPage - 1) * this.libraryPageSize;
    return items.slice(start, start + this.libraryPageSize);
  }

  get totalLibraryPages(): number {
    const items = this.filteredLibraryItems;
    return Math.max(1, Math.ceil(items.length / this.libraryPageSize));
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

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get allowCollection(): boolean {
    return this.isAdmin;
  }

  getDefaultAvatar(gender?: string): string {
    const g = gender?.toLowerCase();
    if (g === 'male') return 'assets/male.png';
    if (g === 'female') return 'assets/female.png';
    return 'assets/unknown.png';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }
  
  hideBrokenCover(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.style.display = 'none';
    }
  }
}