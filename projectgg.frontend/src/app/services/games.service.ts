import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Game } from '../models/game.model';

type GameApiItem = Partial<Game> & {
  game_name?: string;
  game_code?: string;
  sequence_timeline?: number | null;
  sequence_release?: number | null;
  is_series?: boolean;
  series_name?: string | null;
};

export interface SyncResult {
  code: string;
  success: boolean;
  message: string;
  source?: string;
  rating?: number | null;
  genres?: string[];
  platforms?: string[];
  release_year?: number | null;
  search_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GamesService {
  private readonly apiUrl = environment.apiUrl;
  private readonly supabaseUrl = environment.supabase.url;
  private allGamesSubject = new BehaviorSubject<Game[]>([]);
  private userGamesSubject = new BehaviorSubject<Game[]>([]);

  allGames$ = this.allGamesSubject.asObservable();
  userGames$ = this.userGamesSubject.asObservable();

  constructor(private http: HttpClient) {}

  getAllGames(page = 1, pageSize = 12): Observable<Game[]> {
    return this.http.get<unknown>(`${this.apiUrl}/games/get-all-games`, {
      params: {
        page,
        page_size: pageSize,
      },
    }).pipe(
      map((body: unknown) => {
        if (!body) return [];

        const response = body as { data?: GameApiItem[]; rows?: GameApiItem[] } | GameApiItem[];
        const games = Array.isArray(response) ? response : (response.data || response.rows || []);
        return this.withImageFallback(games);
      }),
      tap(games => this.allGamesSubject.next(games))
    );
  }

  getGamesBySeries(seriesName: string): Observable<Game[]> {
    return this.http
      .get<unknown>(`${this.apiUrl}/games/series/${encodeURIComponent(seriesName)}`)
      .pipe(
        map((body: unknown) => {
          if (!body) return [];
          const response = body as { data?: GameApiItem[] } | GameApiItem[];
          const games = Array.isArray(response) ? response : (response.data ?? []);
          return this.withImageFallback(games);
        }),
      );
  }

  getUserGames(userId: string, page = 1, pageSize = 12): Observable<Game[]> {
    return this.http.get<unknown>(`${this.apiUrl}/games/get-user-games`, {
      params: {
        user_id: userId,
        page,
        page_size: pageSize,
      }
    }).pipe(
      map((body: unknown) => {
        if (!body) return [];

        const response = body as { data?: GameApiItem[]; rows?: GameApiItem[] } | GameApiItem[];
        const games = Array.isArray(response) ? response : (response.data || response.rows || []);
        return this.withImageFallback(games);
      }),
      tap(games => this.userGamesSubject.next(games))
    );
  }

  addGameToUser(userId: string, gameCode: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/games/add-user-games`, {
      in_user_id: userId,
      in_game_code: gameCode
    }).pipe(
      tap(() => this.userGamesSubject.next([...this.userGamesSubject.value]))
    );
  }

  removeGameFromUser(userId: string, gameCode: string): Observable<boolean> {
    return this.http.delete<boolean>(`${this.apiUrl}/games/remove-user-games`, {
      params: {
        user_id: userId,
        game_code: gameCode,
      },
    }).pipe(
      tap(() => this.userGamesSubject.next(this.userGamesSubject.value.filter((game) => game.code !== gameCode)))
    );
  }

  searchGames(query: string, page = 1, pageSize = 12): Observable<Game[]> {
    return this.http.get<unknown>(`${this.apiUrl}/games/search`, {
      params: { q: query, page, page_size: pageSize },
    }).pipe(
      map((body: unknown) => {
        if (!body) return [];
        const response = body as { data?: GameApiItem[]; rows?: GameApiItem[] } | GameApiItem[];
        const games = Array.isArray(response) ? response : (response.data || response.rows || []);
        return this.withImageFallback(games);
      })
    );
  }

  getSyncQueue(force: boolean = false, q?: string, brokenOnly: boolean = false): Observable<{ code: string; name: string; missing: string[]; locked_columns?: string[] }[]> {
    const params: any = {};
    if (force) params.force = 'true';
    if (q) params.q = q;
    if (brokenOnly) params.broken = 'true';
    return this.http.get<{ code: string; name: string; missing: string[]; locked_columns?: string[] }[]>(`${this.apiUrl}/games/sync/queue`, { params });
  }

  lockColumn(code: string, column: string): Observable<{ locked_columns: string[] }> {
    return this.http.post<{ locked_columns: string[] }>(`${this.apiUrl}/games/sync/lock/${code}/${column}`, null);
  }

  unlockColumn(code: string, column: string): Observable<{ locked_columns: string[] }> {
    return this.http.delete<{ locked_columns: string[] }>(`${this.apiUrl}/games/sync/lock/${code}/${column}`);
  }

  syncGame(code: string, name?: string, searchOnly: boolean = false): Observable<SyncResult | any[]> {
    const params: any = {};
    if (name) params.name = name;
    if (searchOnly) params.search_only = 'true';
    return this.http.post<SyncResult | any[]>(`${this.apiUrl}/games/sync/${code}`, null, { params });
  }

  getMissingSeries(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/games/sync/missing-series`);
  }

  uploadSeriesCover(name: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('file', file, file.name);
    return this.http.post(`${this.apiUrl}/games/sync/series-cover`, fd);
  }

  searchExternal(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/games/sync/search/external`, {
      params: { q: query },
    });
  }

  getAuthUrl(platform: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/platform/${platform}/auth-url`);
  }

  importGame(data: {
    name: string;
    cover_url?: string;
    genres?: string[];
    external_id?: string;
    external_source?: string;
    rating?: number | null;
    release_year?: number | null;
    desc?: string;
    platforms?: string[];
    sources?: string[];
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/sync/import`, data);
  }

  importToGame(code: string, data: {
    name: string;
    cover_url?: string;
    genres?: string[];
    external_id?: string;
    source?: string;
    rating?: number | null;
    release_year?: number | null;
    desc?: string;
    platforms?: string[];
    sources?: string[];
  }): Observable<SyncResult> {
    return this.http.post<SyncResult>(`${this.apiUrl}/games/sync/import-to-game/${code}`, data);
  }

  private normalizeGame(game: GameApiItem): Game {
    return {
      name: game.name ?? game.game_name ?? '',
      code: game.code ?? game.game_code ?? '',
      desc: game.desc ?? '',
      imageUrl: game.imageUrl ?? game.cover_url,
      series_image_url: game.series_image_url,
      total_count: game.total_count,
      sequence_timeline: game.sequence_timeline ?? null,
      sequence_release: game.sequence_release ?? null,
      is_series: game.is_series ?? false,
      series_name: game.series_name ?? null,
      genres: game.genres ?? [],
      cover_url: game.cover_url,
      external_id: game.external_id,
      external_source: game.external_source,
      rating: game.rating ?? null,
      release_year: game.release_year ?? null,
      platforms: game.platforms ?? ['pc'],
      sources: game.sources ?? ['pc'],
      tier: game.tier ?? undefined,
      collected_at: game.collected_at ?? undefined,
      xp_awarded: game.xp_awarded ?? undefined,
    };
  }

  private withImageFallback(games: GameApiItem[]): Game[] {
    return games.map((game) => {
      const normalized = this.normalizeGame(game);
      return {
        ...normalized,
        imageUrl: normalized.imageUrl ?? this.getImageUrl(normalized.code),
      };
    });
  }

  getLocalAllGames(): Game[] {
    return this.allGamesSubject.value;
  }

  getLocalUserGames(): Game[] {
    return this.userGamesSubject.value;
  }

  getImageUrl(gameCode: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/system_files/game/${gameCode}.jpg`;
  }

  validatePlatform(platform: string, body: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/platform/${platform}/validate`, body);
  }
}
