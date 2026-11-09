import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Subject, interval } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { GamesService } from '../../services/games.service';
import { FormsModule } from '@angular/forms';
import { Game } from '../../models/game.model';
import { environment } from '../../../environments/environment';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { GameCardComponent } from '../../components/game-card/game-card.component';
import { PaginatorComponent } from '../../components/paginator/paginator.component';
import { CyberDropdownComponent, DropdownItem } from '../../components/cyber-dropdown/cyber-dropdown.component';
import { ThemeService } from '../../services/theme.service';
import { ThemeOption } from '../../components/theme-selector/theme-selector.component';
import { UserStatusService, UserStatus } from '../../services/user-status.service';
import { ChatService } from '../../services/chat.service';
import { CardDrawComponent } from '../../components/card-draw/card-draw.component';
import { CardCollectionComponent } from '../../components/card-collection/card-collection.component';
import { WebpSrcDirective } from '../../components/webp-src/webp-src.directive';

type SeriesGroup = {
  name: string;
  games: Game[];
};

type LibraryItem =
  | { type: 'game'; game: Game }
  | { type: 'series'; series: SeriesGroup };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    SkeletonComponent,
    GameCardComponent,
    PaginatorComponent,
    FormsModule,
    CyberDropdownComponent,
    CardDrawComponent,
    CardCollectionComponent,
    RouterLink,
    WebpSrcDirective,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly pageSize = 12;
  readonly libraryPageSize = 12; // raw server chunk size (games per API page)
  readonly tilesPerPage = 9; // display page size: 3 rows x 3 columns
  readonly seriesPageSize = 12;
  readonly cardPageSize = 10;

  private loadedServerPage = 0; // highest server page fetched so far
  private noMoreRawData = false; // server returned a short/empty page

  currentUser: any = null;
  allGames: Game[] = [];
  userGames: Game[] = [];
  totalGames = 0;
  loading = true;
  error = '';
  currentTheme: 'green' | 'red' | 'yellow' | 'blue' = 'green';
  currentStatus: UserStatus = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;
  expandedSeries = new Set<string>();
  seriesCurrentPages: Record<string, number> = {};
  private seriesGamesCache = new Map<string, Game[]>();
  libraryCurrentPage = 1;
  searchQuery = '';
  searchResults: Game[] | null = null;
  searching = false;

  // UI state
  connectionsLoaded = false;
  discordConnected = false;
  sortDropdownOpen = false;
  sortItems: DropdownItem[] = [
    { label: 'Name', action: () => this.onSortChange('name') },
    { label: 'Release', action: () => this.onSortChange('release') },
    { label: 'Timeline', action: () => this.onSortChange('timeline') },
  ];
  sortOption: 'name' | 'release' | 'timeline' = 'name';
  apiUrl = environment.apiUrl;

  // Card collection
  cardStats: any = null;
  cards: any[] = [];
  cardTotal = 0;
  cardCurrentPage = 1;
  cardSort: 'newest' | 'name' | 'tier' = 'newest';
  cardDrawTickets: any[] = [];
  recentDrawCode: string | null = null;

  @ViewChild('drawRef') drawRef?: CardDrawComponent;
  private cardRefreshSub: any = null;
  
  // ... (keep existing properties)

  constructor(
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly games: GamesService,
    private readonly cdr: ChangeDetectorRef,
    private readonly themeService: ThemeService,
    private readonly userStatus: UserStatusService,
    private readonly chatService: ChatService,
  ) {}

  ngOnInit(): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    // Subscribe to authentication state changes
    this.auth.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.loadData();
        this.loadConnections();
        this.loadCardStats();
        this.loadCardCollection();
        this.loadDrawTickets();
      }
    });

    // Fallback if already set
    this.currentUser = this.auth.getCurrentUser();
    if (this.currentUser) {
        this.loadData();
        this.loadConnections();
        this.loadCardStats();
        this.loadCardCollection();
        this.loadDrawTickets();
    }

    this.applySavedTheme();
    this.currentStatus = this.userStatus.currentStatus;
    this.userStatus.currentStatus$.subscribe((status) => {
      this.currentStatus = status;
      this.cdr.markForCheck();
    });

    this.connectSocket();

    // Poll card collection every 15s as a live-update fallback
    this.cardRefreshSub = interval(15000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadCardStats();
        this.loadCardCollection();
      });
  }

  private connectSocket(): void {
    const socket = this.chatService.connect();
    socket.on('cards:updated', () => {
      this.loadCardCollection();
      this.loadCardStats();
      this.loadDrawTickets();
    });
    socket.on('trade:new', () => {
      this.loadCardCollection();
    });
    socket.on('trade:completed', () => {
      this.loadCardCollection();
      this.loadCardStats();
    });
    socket.on('task-completed', () => {
      this.loadCardStats();
    });
  }

  loadCardCollection(page?: number, sort?: string): void {
    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (!userId) return;
    if (page) this.cardCurrentPage = page;
    if (sort) this.cardSort = sort as 'newest' | 'name' | 'tier';
    this.chatService.getCardCollection(this.cardCurrentPage, this.cardPageSize, undefined, undefined, this.cardSort).subscribe({
      next: (res) => {
        this.cards = (res?.items ?? []) as any[];
        this.cardTotal = res?.total ?? 0;
        this.cdr.markForCheck();
      },
      error: () => { this.cards = []; this.cardTotal = 0; this.cdr.markForCheck(); }
    });
  }

  goToCardPage(page: number): void {
    if (page === this.cardCurrentPage) return;
    this.loadCardCollection(page);
  }

  onCardSortChange(sort: string): void {
    this.loadCardCollection(1, sort);
  }

  get cardTotalPages(): number {
    return Math.max(1, Math.ceil(this.cardTotal / this.cardPageSize));
  }

  toggleFavorite(gameCode: string): void {
    this.chatService.toggleCardFavorite(gameCode).subscribe({
      next: (isFavorite) => {
        const card = this.cards.find(c => c.game_code === gameCode);
        if (card) card.is_favorite = isFavorite;
        this.cdr.markForCheck();
      }
    });
  }
  setTheme(theme: 'green' | 'red' | 'yellow' | 'blue'): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false;
    this.themeService.setTheme(theme as ThemeOption);
  }

  private applySavedTheme(): void {
    const saved = this.themeService.currentTheme();
    this.currentTheme = saved === 'custom' ? 'green' : saved;
  }

  toggleThemeDropdown(): void {
    this.themeDropdownOpen = !this.themeDropdownOpen;
    this.statusDropdownOpen = false;
    this.profileDropdownOpen = false;
  }

  setStatus(status: UserStatus): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    this.userStatus.setStatus(status);
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

  get sortLabel(): string {
    switch (this.sortOption) {
      case 'release':
        return 'Release';
      case 'timeline':
        return 'Timeline';
      default:
        return 'Name';
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
      dnd: '#8c96a8',
      invisible: '#b36bff',
    };
    return colors[status] || colors['online'];
  }

  // ===== CARD COLLECTION =====

  loadCardStats(): void {
    this.chatService.getCollectionStats().subscribe({
      next: (stats) => { this.cardStats = stats; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  openCardDraw(): void {
    if (!this.cardStats?.today_drawn) {
      this.drawRef?.startDailyDraw();
    } else {
      const ticket = this.cardDrawTickets[0];
      if (ticket) {
        this.drawRef?.startTicketDraw(ticket.id);
        this.cardDrawTickets = this.cardDrawTickets.filter(t => t.id !== ticket.id);
      }
    }
  }

  loadDrawTickets(): void {
    this.chatService.getDrawTickets().subscribe({
      next: (tickets) => { this.cardDrawTickets = tickets; this.cdr.markForCheck(); },
    });
  }

  onDrawComplete(result?: { card?: { game_code?: string } }): void {
    this.recentDrawCode = result?.card?.game_code ?? null;
    this.loadCardStats();
    this.loadCardCollection();
    this.loadDrawTickets();
    if (this.recentDrawCode) {
      setTimeout(() => {
        this.recentDrawCode = null;
        this.cdr.markForCheck();
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.cardRefreshSub) {
      this.cardRefreshSub.unsubscribe();
      this.cardRefreshSub = null;
    }
  }

  private loadData(): void {
    this.loading = true;
    this.error = '';

    this.fillUntilPageFilled();

    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (userId) {
      this.games
        .getUserGames(String(userId), 1, 1000)
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

  /**
   * Accumulate raw server pages until the current display page holds a
   * full set of tiles (3 rows x 3 cols), or the server has no more data.
   * Pages show a combination of series tiles + single games. The last
   * display page may hold fewer items if the catalog runs out.
   */
  private fillUntilPageFilled(): void {
    this.loading = true;
    const needed = this.libraryCurrentPage * this.tilesPerPage;
    const exhausted =
      this.noMoreRawData ||
      (this.totalGames > 0 &&
        this.loadedServerPage * this.libraryPageSize >= this.totalGames);
    if (this.libraryItems.length >= needed || exhausted) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    const nextPage = this.loadedServerPage + 1;
    this.games
      .getAllGames(nextPage, this.libraryPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (games) => {
          this.loadedServerPage = nextPage;
          const list = games ?? [];
          this.allGames = [...this.allGames, ...list];
          this.totalGames = list[0]?.total_count ?? this.totalGames;
          if (list.length < this.libraryPageSize) {
            this.noMoreRawData = true;
          }
          this.ensureSeriesLoaded(list);
          this.fillUntilPageFilled();
        },
        error: (err) => {
          console.error('Error loading games:', err);
          this.error = 'Failed to load the game feed.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private ensureSeriesLoaded(games: Game[]): void {
    const names = [
      ...new Set(
        games
          .filter((g) => g.series_name)
          .map((g) => g.series_name as string),
      ),
    ];
    for (const name of names) {
      if (this.seriesGamesCache.has(name)) continue;
      this.seriesGamesCache.set(name, []);
      this.games
        .getGamesBySeries(name)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (seriesGames) => {
            this.seriesGamesCache.set(name, seriesGames ?? []);
            this.cdr.markForCheck();
          },
          error: () => this.cdr.markForCheck(),
        });
    }
  }

  private loadConnections(): void {
    this.http.get<any[]>(`${this.apiUrl}/platform/connections`).subscribe({
      next: (conns) => {
        this.discordConnected = conns.some(c => c.platform === 'discord');
        this.connectionsLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => { this.connectionsLoaded = true; },
    });
  }

  linkDiscord(): void {
    this.router.navigate(['/settings'], { queryParams: { highlight: 'discord' } });
  }

  getPlatformLogo(id: string): string {
    return `/assets/icons/platforms/${id}.svg`;
  }

  addGame(gameCode: string): void {
    const userId = this.currentUser?.id ?? this.currentUser?.sub;
    if (!userId) return;

    const game =
      this.allGames.find((g) => g.code === gameCode) ??
      [...this.seriesGamesCache.values()]
        .flat()
        .find((g) => g.code === gameCode);
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
      .getUserGames(userId, 1, 1000)
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

      // Prefer the full series list fetched from the server so an
      // expanded series shows ALL its games, not just this page's subset.
      const fullList = this.seriesGamesCache.get(game.series_name);
      const list =
        fullList && fullList.length > 0 ? fullList : [game];
      if (!grouped.has(game.series_name)) {
        grouped.set(game.series_name, [...list]);
      }
    }

    return [...grouped.entries()]
      // 1+ = more than 1: a series needs MORE THAN ONE game to be a series.
      // A single game is NOT a series — it renders as a normal standalone card.
      .filter(([, games]) => games.length > 1)
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
    // Each display page shows one full grid (3 rows x 3 cols) of tiles.
    const start = (this.libraryCurrentPage - 1) * this.tilesPerPage;
    return this.filteredLibraryItems.slice(start, start + this.tilesPerPage);
  }

  get totalLibraryPages(): number {
    if (this.searchResults) {
      return Math.max(
        1,
        Math.ceil(this.filteredLibraryItems.length / this.tilesPerPage),
      );
    }
    const known = Math.ceil(this.libraryItems.length / this.tilesPerPage);
    // While more catalog data may still load, always offer a "next" page
    // so the user can keep paging forward; it becomes exact at the end.
    return this.noMoreRawData ? Math.max(1, known) : Math.max(known, 1) + 1;
  }

  get totalPages(): number {
    return this.totalLibraryPages;
  }

  get libraryItems(): LibraryItem[] {
    // Standalone = no series_name, OR a series with only 1 game total.
    // A single game is NOT a series — it renders as a normal game card.
    const standaloneItems: LibraryItem[] = this.allGames
      .filter(
        (game) =>
          !game.series_name ||
          (this.seriesGamesCache.get(game.series_name)?.length ?? 0) <= 1,
      )
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
    const boundedPage = Math.max(1, page);
    if (boundedPage === this.libraryCurrentPage) {
      return;
    }
    this.libraryCurrentPage = boundedPage;
    if (!this.searchResults) {
      // Fetch more raw pages until this display page is filled.
      this.fillUntilPageFilled();
    }
    this.cdr.markForCheck();
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
    if (page < 1 || page > this.totalPages || page === this.libraryCurrentPage) {
      return;
    }

    this.goToLibraryPage(page);
  }

  isAdded(gameCode: string): boolean {
    if (this.userGames && this.userGames.some((game) => game.code === gameCode)) return true;
    if (this.cards && this.cards.some((card: any) => card.game_code === gameCode)) return true;
    return false;
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get allowCollection(): boolean {
    return this.isAdmin;
  }

  getDefaultAvatar(gender?: string): string {
    const g = gender?.toLowerCase();
    if (g === 'male') return '/assets/avatars/male.webp';
    if (g === 'female') return '/assets/avatars/female.webp';
    return '/assets/avatars/unknown.webp';
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