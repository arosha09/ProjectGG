import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { SyncResultDto, SyncSearchResultDto, SyncQueueDto } from 'src/dto/sync/sync.dto';

@Injectable()
export class GamesSyncService {
  private readonly raggApiKey: string;
  private readonly steamGridDbKey: string;

  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/['':\-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static rawgPlatforms(platforms: { platform: { slug: string } }[]): string[] {
    const map: Record<string, string> = {
      pc: 'pc',
      playstation5: 'ps5',
      ps5: 'ps5',
      playstation4: 'ps4',
      ps4: 'ps4',
      playstation3: 'ps3',
      ps3: 'ps3',
      playstation2: 'ps2',
      ps2: 'ps2',
      playstation1: 'ps1',
      ps1: 'ps1',
      'xbox-series-x': 'xbox-series-x',
      'xbox-one': 'xbox-one',
      'xbox-360': 'xbox-360',
      xbox: 'xbox',
      'nintendo-switch': 'nintendo-switch',
      'wii-u': 'wii-u',
      wii: 'wii',
      '3ds': '3ds',
      'nintendo-ds': 'nds',
      'nintendo-64': 'n64',
      linux: 'pc',
      macos: 'pc',
      mac: 'pc',
      ios: 'mobile',
      android: 'mobile',
    };
    return [...new Set((platforms ?? []).map(p => map[p.platform.slug] ?? p.platform.slug))];
  }

  private generateCode(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    configService: ConfigService,
  ) {
    this.raggApiKey = configService.get<string>('RAWG_API_KEY') ?? '';
    this.steamGridDbKey = configService.get<string>('STEAMGRIDDB_API_KEY') ?? '';
  }

  private static normalizeForCompare(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private async isValidImageUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch { }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async searchLocal(query: string): Promise<Set<string>> {
    try {
      const { data, error } = await this.supabase
        .schema('projectgg')
        .from('games_master')
        .select('name')
        .ilike('name', `%${query}%`)
        .limit(100);
      if (error) return new Set();
      return new Set((data ?? []).map((g: any) => this.generateCode(g.name)));
    } catch {
      return new Set();
    }
  }

  async searchExternal(query: string): Promise<SyncSearchResultDto[]> {
    const seenMap = new Map<string, SyncSearchResultDto>();
    const ownedSet = await this.searchLocal(query);

    const merge = (item: SyncSearchResultDto): void => {
      const key = GamesSyncService.normalizeForCompare(item.name);
      if (seenMap.has(key)) {
        const existing = seenMap.get(key)!;
        existing.sources = [...new Set([...existing.sources, ...item.sources])];
        existing.platforms = [...new Set([...existing.platforms, ...item.platforms])];
        if (!existing.cover_url && item.cover_url) existing.cover_url = item.cover_url;
        if (item.release_year && (!existing.release_year || item.release_year < existing.release_year))
          existing.release_year = item.release_year;
        if (item.genres.length > 0 && existing.genres.length === 0) existing.genres = item.genres;
        if (item.desc && !existing.desc) existing.desc = item.desc;
        if (item.rating && !existing.rating) existing.rating = item.rating;
        return;
      }
      if (ownedSet.size > 0) {
        const code = this.generateCode(item.name);
        if (ownedSet.has(code)) return;
      }
      seenMap.set(key, { ...item });
    };

    // 1. Search storefronts (Steam, GOG, Epic) in parallel
    const [steamResults, gogResults, epicResults] = await Promise.all([
      this.steamSearch(query).catch(() => [] as SyncSearchResultDto[]),
      this.gogSearch(query).catch(() => [] as SyncSearchResultDto[]),
      this.epicSearch(query).catch(() => [] as SyncSearchResultDto[]),
    ]);
    for (const r of steamResults) merge(r);
    for (const r of gogResults) merge(r);
    for (const r of epicResults) merge(r);

    // 2. Enrich existing with RAWG metadata; add RAWG-only discoveries
    if (this.raggApiKey) {
      const rawgResults = await this.rawgSearch(query).catch(() => [] as SyncSearchResultDto[]);
      for (const r of rawgResults) {
        const key = GamesSyncService.normalizeForCompare(r.name);
        if (seenMap.has(key)) {
          const existing = seenMap.get(key)!;
          existing.platforms = [...new Set([...existing.platforms, ...r.platforms])];
          if (existing.genres.length === 0) existing.genres = r.genres;
          if (!existing.rating) existing.rating = r.rating;
          if (!existing.release_year) existing.release_year = r.release_year;
          if (r.cover_url) existing.cover_url = r.cover_url;
          if (r.desc && !existing.desc) existing.desc = r.desc;
        } else {
          merge(r);
        }
      }
    }

    // 3. Precision filter — only keep results whose normalized name contains the full normalized query
    let entries = Array.from(seenMap.values());
    const normalizedQuery = GamesSyncService.normalizeForCompare(query);
    entries = entries.filter(r =>
      GamesSyncService.normalizeForCompare(r.name).includes(normalizedQuery)
    );

    // 4. Validate cover images — drop results with broken covers
    entries = (await Promise.all(entries.map(async (r) => {
      if (r.cover_url && !(await this.isValidImageUrl(r.cover_url))) {
        r.cover_url = '';
      }
      return r;
    }))).filter(r => r.cover_url);

    // 5. Filter out DLCs, add-ons, season passes — only game titles
    const dlcPattern = /\b(DLC|Add.?[Oo]n|Addon|Season\s+Pass|Pre.?[Oo]rder|Preorder|Bonus\s+Content)\b/i;
    entries = entries.filter(r => !dlcPattern.test(r.name));
    entries.sort((a, b) => {
      const aExact = GamesSyncService.normalizeForCompare(a.name) === normalizedQuery ? 0 : 1;
      const bExact = GamesSyncService.normalizeForCompare(b.name) === normalizedQuery ? 0 : 1;
      return aExact - bExact;
    });

    // 5. If exact match not found, try precise RAWG search
    const hasExact = entries.some(r => GamesSyncService.normalizeForCompare(r.name) === normalizedQuery);
    if (!hasExact && this.raggApiKey) {
      const exact = await this.rawgExactSearch(query);
      if (exact) {
        const key = GamesSyncService.normalizeForCompare(exact.name);
        if (!seenMap.has(key) && !ownedSet.has(this.generateCode(exact.name)) && !dlcPattern.test(exact.name)) {
          if (exact.cover_url && await this.isValidImageUrl(exact.cover_url)) {
            entries.unshift(exact);
          }
        }
      }
    }

    return entries;
  }

  async getSyncQueue(force: boolean = false, q?: string, brokenOnly: boolean = false): Promise<SyncQueueDto[]> {
    try {
      return await this.querySyncQueue(force, q, true, brokenOnly);
    } catch {
      return await this.querySyncQueue(force, q, false, brokenOnly);
    }
  }

  private async querySyncQueue(force: boolean, q?: string, includeBrokenFields: boolean = true, brokenOnly: boolean = false): Promise<SyncQueueDto[]> {
    const selectFields = includeBrokenFields
      ? 'code, name, cover_url, genres, rating, platforms, sources, last_synced_at, broken_fields, locked_columns'
      : 'code, name, cover_url, genres, rating, platforms, sources, last_synced_at';

    let query = this.supabase
      .schema('projectgg')
      .from('games_master')
      .select(selectFields);

    if (!force) {
      query = query.or('cover_url.is.null,last_synced_at.is.null,last_synced_at.lt.' + this.subtractDays(7));
    }

    if (q) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    }

    const { data: baseData, error } = await query.order('name', { ascending: true });
    if (error) throw error;

    let results: any[] = baseData ?? [];

    // Also include games with broken_fields that aren't caught by the SQL filter
    if (!force && includeBrokenFields) {
      try {
        const { data: brokenData } = await this.supabase
          .schema('projectgg')
          .from('games_master')
          .select(selectFields)
          .not('broken_fields', 'is', null);
        if (brokenData) {
          const existingCodes = new Set(results.map((g: any) => g.code));
          for (const g of brokenData) {
            if (g.broken_fields && g.broken_fields.length > 0 && !existingCodes.has(g.code)) {
              results.push(g);
            }
          }
        }
      } catch (e) {
        console.error('[sync] broken_fields subquery failed:', e);
      }
    }

    // Validate existing cover URLs — persist broken covers to DB so resync fixes them.
    // Skip for force scans (too many games); runs on normal stale/broken scans.
    if (!force && !q) {
      await Promise.all(results.map(async (g: any) => {
        if (!g.cover_url) return;
        const broken: string[] = g.broken_fields ?? [];
        if (broken.includes('cover_url')) return;
        const valid = await this.isValidImageUrl(g.cover_url);
        if (valid) return;
        broken.push('cover_url');
        g.broken_fields = broken;
        await this.supabase
          .schema('projectgg')
          .from('games_master')
          .update({ broken_fields: broken })
          .eq('code', g.code);
      }));
    }

    // Filter to only broken_fields games if requested
    if (brokenOnly) {
      results = results.filter(g => g.broken_fields && g.broken_fields.length > 0);
    }

    const thirtyDays = new Date(this.subtractDays(30));
    return results.map(g => {
      const broken: string[] = includeBrokenFields ? (g.broken_fields ?? []) : [];
      const locked: string[] = g.locked_columns ?? [];
      const missing: string[] = [];
      if (!g.cover_url) missing.push('cover');
      else if (broken.includes('cover_url')) missing.push('broken-cover');
      if (!g.genres || g.genres.length === 0) missing.push('genres');
      if (g.rating == null) missing.push('rating');
      if (!g.platforms || g.platforms.length === 0) missing.push('platforms');
      if (!g.sources || g.sources.length === 0) missing.push('sources');
      if (!g.last_synced_at) missing.push('never');
      else if (new Date(g.last_synced_at) < thirtyDays) missing.push('stale');
      return { code: g.code, name: g.name, missing, locked_columns: locked };
    });
  }

  private subtractDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  private async coverFallback(result: SyncResultDto, name: string, code: string): Promise<void> {
    if (result.cover_url && await this.isValidImageUrl(result.cover_url)) return;
    if (!this.steamGridDbKey) return;
    const sgdb = await this.trySteamGridDB(name, code);
    if (sgdb.success && sgdb.cover_url) {
      result.cover_url = sgdb.cover_url;
      result.message += ' (cover via SGDB)';
      if (sgdb.external_id && !result.external_id) result.external_id = sgdb.external_id;
      result.sources = [...new Set([...(result.sources ?? []), ...(sgdb.sources ?? [])])];
    }
  }

  async syncGame(code: string, name: string): Promise<SyncResultDto> {
    let locked: string[] = [];
    try {
      const { data: lockData } = await this.supabase
        .schema('projectgg')
        .from('games_master')
        .select('locked_columns')
        .eq('code', code)
        .single();
      locked = lockData?.locked_columns ?? [];
    } catch { }

    const steamResult = await this.trySteam(name, code);
    if (steamResult.success) {
      await this.coverFallback(steamResult, name, code);
      try { await this.persistSync(code, steamResult, locked); } catch (e: any) { console.error(`[sync] persistSync (steam) failed for ${code}:`, e); return { code, success: false, message: `Steam OK but DB write failed: ${e.message ?? e}` }; }
      return steamResult;
    }

    const gogResult = await this.tryGOG(name, code);
    if (gogResult.success) {
      await this.coverFallback(gogResult, name, code);
      try { await this.persistSync(code, gogResult, locked); } catch (e: any) { console.error(`[sync] persistSync (gog) failed for ${code}:`, e); return { code, success: false, message: `GOG OK but DB write failed: ${e.message ?? e}` }; }
      return gogResult;
    }

    const raggResult = await this.tryRAWG(name, code);
    if (raggResult.success) {
      await this.coverFallback(raggResult, name, code);
      try { await this.persistSync(code, raggResult, locked); } catch (e: any) { console.error(`[sync] persistSync (rawg) failed for ${code}:`, e); return { code, success: false, message: `RAWG OK but DB write failed: ${e.message ?? e}` }; }
      return raggResult;
    }

    const sgdbResult = await this.trySteamGridDB(name, code);
    if (sgdbResult.success) {
      try { await this.persistSync(code, sgdbResult, locked); } catch (e: any) { console.error(`[sync] persistSync (sgdb) failed for ${code}:`, e); return { code, success: false, message: `SteamGridDB OK but DB write failed: ${e.message ?? e}` }; }
      return sgdbResult;
    }

    return { code, success: false, message: 'Not found on Steam, GOG, RAWG, or SteamGridDB' };
  }

  async createGameFromExternal(data: {
    name: string;
    cover_url?: string;
    genres?: string[];
    external_id?: string;
    rating?: number | null;
    release_year?: number | null;
    desc?: string;
    platforms?: string[];
    sources?: string[];
  }): Promise<any> {
    const { data: result, error } = await this.supabase.rpc('create_game_from_external', {
      in_name: data.name,
      in_code: null,
      in_desc: data.desc ?? null,
      in_cover_url: data.cover_url ?? null,
      in_genres: data.genres ?? null,
      in_external_id: data.external_id ?? null,
      in_rating: data.rating ?? null,
      in_sequence_release: data.release_year ?? null,
      in_is_series: false,
      in_series_name: null,
      in_platforms: data.platforms ?? ['pc'],
      in_sources: data.sources ?? ['pc'],
    });

    if (error) throw error;
    return result;
  }

  async toggleLock(code: string, column: string, lock: boolean): Promise<{ locked_columns: string[] }> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('locked_columns')
      .eq('code', code)
      .single();
    if (error) throw error;
    let locked: string[] = data?.locked_columns ?? [];
    if (lock && !locked.includes(column)) {
      locked.push(column);
    } else if (!lock) {
      locked = locked.filter((c: string) => c !== column);
    }
    const { error: updateError } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .update({ locked_columns: locked })
      .eq('code', code);
    if (updateError) throw updateError;
    return { locked_columns: locked };
  }

  private async persistSync(
    code: string,
    result: SyncResultDto,
    locked: string[] = [],
  ): Promise<void> {
    // Strip locked fields — they won't be updated
    if (locked.includes('cover_url')) result.cover_url = undefined;
    if (locked.includes('genres')) { result.genres = []; }
    if (locked.includes('rating')) result.rating = undefined;
    if (locked.includes('platforms')) { result.platforms = undefined; }
    if (locked.includes('sources')) { result.sources = undefined; }

    const extId = result.external_id
      ?? (result.source === 'steam' && result.cover_url
        ? result.cover_url.match(/\/apps\/(\d+)\//)?.[1] ?? null
        : null);

    const clearBroken: string[] = [];
    if (result.cover_url && await this.isValidImageUrl(result.cover_url)) clearBroken.push('cover_url');
    else if (result.cover_url) console.warn(`[sync] skipping clear of cover_url for ${code} — URL failed validation`);
    if (result.genres && result.genres.length > 0) clearBroken.push('genres');
    if (result.rating != null) clearBroken.push('rating');
    if (result.platforms && result.platforms.length > 0) clearBroken.push('platforms');
    if (result.sources && result.sources.length > 0) clearBroken.push('sources');

    const { error } = await this.supabase.rpc('update_game_external', {
      in_code: code,
      in_cover_url: result.cover_url ?? null,
      in_genres: result.genres ?? null,
      in_external_id: extId,
      in_rating: result.rating ?? null,
      in_sequence_release: result.release_year ?? null,
      in_desc: result.desc ?? null,
      in_platforms: result.platforms ?? null,
      in_sources: result.sources ?? null,
      in_last_synced_at: new Date().toISOString(),
      in_clear_broken: clearBroken.length > 0 ? clearBroken : null,
    });
    if (error) {
      console.error(`[sync] RPC update_game_external error for ${code}:`, error);
      throw error;
    }
    console.log(`[DEBUG] persistSync RPC call successful for ${code}`);
  }

  private async steamRating(appId: number): Promise<number | null> {
    try {
      const url = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=summary&language=all`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data: any = await res.json();
      const score = data?.query_summary?.review_score;
      if (typeof score === 'number') {
        return score * 10;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async trySteam(
    name: string,
    code: string,
  ): Promise<SyncResultDto> {
    try {
      const searchUrl = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(name)}&cc=us&l=en`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return { code, success: false, message: 'Steam search failed' };

      const searchData: any = await searchRes.json();
      const items = searchData?.items ?? [];
      if (items.length === 0) return { code, success: false, message: 'Not on Steam' };

      const best = items[0];
      const appId = best.id;

      const detailUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) return { code, success: false, message: 'Steam details failed' };

      const detailData: any = await detailRes.json();
      const appData = detailData[String(appId)]?.data;
      if (!appData) return { code, success: false, message: 'No Steam data' };

      const genres: string[] = (appData.genres ?? []).map((g: any) => g.description);
      const coverUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
      let rating = appData.metacritic?.score ?? null;
      if (rating === null) {
        rating = await this.steamRating(appId);
      }
      const releaseYear = appData.release_date?.date
        ? new Date(appData.release_date.date).getFullYear()
        : null;
      const desc = appData.short_description ?? appData.about_the_game ?? null;

      return {
        code,
        success: true,
        message: 'Synced via Steam',
        genres,
        cover_url: coverUrl,
        source: 'steam',
        rating,
        release_year: releaseYear,
        desc,
        external_id: String(appId),
        platforms: ['pc'],
        sources: ['steam'],
      };
    } catch (err: any) {
      return { code, success: false, message: `Steam error: ${err.message}` };
    }
  }

  private async tryRAWG(
    name: string,
    code: string,
  ): Promise<SyncResultDto> {
    if (!this.raggApiKey) return { code, success: false, message: 'No RAWG API key' };

    try {
      const searchUrl = `https://api.rawg.io/api/games?key=${this.raggApiKey}&search=${encodeURIComponent(name)}&page_size=1`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return { code, success: false, message: 'RAWG search failed' };

      const searchData: any = await searchRes.json();
      const results = searchData?.results ?? [];
      if (results.length === 0) return { code, success: false, message: 'Not on RAWG' };

      const game = results[0];
      const detailUrl = `https://api.rawg.io/api/games/${game.id}?key=${this.raggApiKey}`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) return { code, success: false, message: 'RAWG details failed' };

      const detailData: any = await detailRes.json();
      const genres: string[] = (detailData.genres ?? []).map((g: any) => g.name);
      const coverUrl = detailData.background_image;
      const rating = detailData.metacritic ?? detailData.rating ? Math.round(detailData.rating * 20) : null;
      const releaseYear = detailData.released ? new Date(detailData.released).getFullYear() : null;
      const desc = detailData.description_raw ?? detailData.description ?? null;
      const rawgPlatforms: { platform: { slug: string } }[] = detailData.platforms ?? [];
      const platforms = GamesSyncService.rawgPlatforms(rawgPlatforms);

      return {
        code,
        success: true,
        message: 'Synced via RAWG',
        genres,
        cover_url: coverUrl,
        source: 'rawg',
        rating,
        release_year: releaseYear,
        desc,
        external_id: String(game.id),
        platforms,
        sources: ['rawg'],
      };
    } catch (err: any) {
      return { code, success: false, message: `RAWG error: ${err.message}` };
    }
  }

  private async trySteamGridDB(name: string, code: string): Promise<SyncResultDto> {
    if (!this.steamGridDbKey) return { code, success: false, message: 'No SteamGridDB API key' };
    try {
      const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(name)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${this.steamGridDbKey}` },
      });
      if (!searchRes.ok) return { code, success: false, message: `SteamGridDB search ${searchRes.status}` };
      const searchData: any = await searchRes.json();
      if (!searchData?.success) return { code, success: false, message: 'SteamGridDB search unsuccessful' };
      const games = searchData.data ?? [];
      if (games.length === 0) return { code, success: false, message: 'Not on SteamGridDB' };

      const gameId = games[0].id;
      const gridsUrl = `https://www.steamgriddb.com/api/v2/grids/game/${gameId}`;
      const gridsRes = await fetch(gridsUrl, {
        headers: { 'Authorization': `Bearer ${this.steamGridDbKey}` },
      });
      if (!gridsRes.ok) return { code, success: false, message: `SteamGridDB grids ${gridsRes.status}` };
      const gridsData: any = await gridsRes.json();
      if (!gridsData?.success) return { code, success: false, message: 'No grids from SteamGridDB' };
      const grids = gridsData.data ?? [];
      if (grids.length === 0) return { code, success: false, message: 'No grid images on SteamGridDB' };

      const grid = grids.find((g: any) => g.width === 600 && g.height === 900) ?? grids[0];
      const coverUrl = grid.url;

      return {
        code,
        success: true,
        message: 'Cover via SteamGridDB',
        genres: [],
        cover_url: coverUrl,
        source: 'steamgriddb',
        rating: null,
        release_year: null,
        desc: undefined,
        external_id: String(gameId),
        platforms: ['pc'],
        sources: ['steamgriddb'],
      };
    } catch (err: any) {
      return { code, success: false, message: `SteamGridDB error: ${err.message}` };
    }
  }

  private async tryGOG(
    name: string,
    code: string,
  ): Promise<SyncResultDto> {
    try {
      const searchUrl = `https://embed.gog.com/games/ajax/filtered?mediaType=game&search=${encodeURIComponent(name)}&limit=5`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return { code, success: false, message: 'GOG search failed' };

      const searchData: any = await searchRes.json();
      const products = searchData?.products ?? [];
      if (products.length === 0) return { code, success: false, message: 'Not on GOG' };

      const best = products[0];
      const gogId = best.id;

      const detailUrl = `https://api.gog.com/products/${gogId}?expand=description,screenshots`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) return { code, success: false, message: 'GOG details failed' };

      const detailData: any = await detailRes.json();

      const genres: string[] = (best.genres ?? []).map((g: any) => typeof g === 'string' ? g : g.name ?? '');
      const imageHash = best.image ?? '';
      const coverUrl = imageHash ? `https://images.gog.com/${imageHash}.jpg` : '';
      const releaseYear = best.releaseDate
        ? new Date(best.releaseDate).getFullYear()
        : null;
      const desc = detailData.description?.lead ?? detailData.description?.full ?? null;

      let rating: number | null = null;
      try {
        const reviewUrl = `https://reviews.gog.com/v1/products/${gogId}/reviews?language=in:en&order=desc:votes&limit=1`;
        const reviewRes = await fetch(reviewUrl);
        if (reviewRes.ok) {
          const reviewData: any = await reviewRes.json();
          rating = reviewData?.overallAvgRating
            ? Math.round(reviewData.overallAvgRating)
            : null;
        }
      } catch { }

      return {
        code,
        success: true,
        message: 'Synced via GOG',
        genres,
        cover_url: coverUrl,
        source: 'gog',
        rating,
        release_year: releaseYear,
        desc,
        external_id: String(gogId),
        platforms: ['pc'],
        sources: ['gog'],
      };
    } catch (err: any) {
      return { code, success: false, message: `GOG error: ${err.message}` };
    }
  }

  private async gogSearch(query: string): Promise<SyncSearchResultDto[]> {
    try {
      const url = `https://embed.gog.com/games/ajax/filtered?mediaType=game&search=${encodeURIComponent(query)}&limit=10`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: any = await res.json();
      const products = data?.products ?? [];

      const results: SyncSearchResultDto[] = [];
      for (const product of products) {
        const genres: string[] = (product.genres ?? []).map((g: any) => typeof g === 'string' ? g : g.name ?? '');
        const imageHash = product.image ?? '';
        const coverUrl = imageHash ? `https://images.gog.com/${imageHash}.jpg` : '';
        const releaseYear = product.releaseDate
          ? new Date(product.releaseDate).getFullYear()
          : 0;

        let rating: number | null = null;
        let desc = '';
        try {
          const detailUrl = `https://api.gog.com/products/${product.id}?expand=description`;
          const detailRes = await fetch(detailUrl);
          if (detailRes.ok) {
            const detailData: any = await detailRes.json();
            desc = detailData.description?.lead ?? detailData.description?.full ?? '';
          }
        } catch { }

        try {
          const reviewUrl = `https://reviews.gog.com/v1/products/${product.id}/reviews?language=in:en&order=desc:votes&limit=1`;
          const reviewRes = await fetch(reviewUrl);
          if (reviewRes.ok) {
            const reviewData: any = await reviewRes.json();
            rating = reviewData?.overallAvgRating
              ? Math.round(reviewData.overallAvgRating)
              : null;
          }
        } catch { }

        results.push({
          id: product.id,
          name: product.title ?? '',
          cover_url: coverUrl,
          release_year: releaseYear,
          genres,
          sources: ['gog'],
          rating,
          desc,
          platforms: ['pc'],
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  private async epicSearch(query: string): Promise<SyncSearchResultDto[]> {
    try {
      const url = `https://catalog-public-service-prod.ol.epicgames.com/catalog/api/shared/search?count=5&keywords=${encodeURIComponent(query)}&country=US&locale=en-US`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: any = await res.json();
      const elements = data?.elements ?? [];
      if (!Array.isArray(elements)) return [];

      return elements
        .filter((e: any) => e?.title)
        .map((e: any) => ({
          id: e.id,
          name: e.title ?? '',
          cover_url: e.keyImages?.find((k: any) => k.type === 'DieselGameBoxTall' || k.type === 'Thumbnail' || k.type === 'OfferImageTall')?.url ?? '',
          release_year: e.releaseDate ? new Date(e.releaseDate).getFullYear() : 0,
          genres: [],
          sources: ['epic'],
          rating: null,
          desc: e.description ?? '',
          platforms: ['pc'],
        }));
    } catch {
      return [];
    }
  }

  private async steamSearch(query: string): Promise<SyncSearchResultDto[]> {
    const searchUrl = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(query)}&cc=us&l=en`;
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const data: any = await res.json();
    const items = data?.items ?? [];
    const top = items.slice(0, 5);

    const results: SyncSearchResultDto[] = [];
    for (const item of top) {
      let rating: number | null = null;
      let desc = '';
      let genres: string[] = [];
      try {
        const detailUrl = `https://store.steampowered.com/api/appdetails?appids=${item.id}&cc=us&l=en`;
        const detailRes = await fetch(detailUrl);
        if (detailRes.ok) {
          const detailData: any = await detailRes.json();
          const appData = detailData[String(item.id)]?.data;
          if (appData) {
            rating = appData.metacritic?.score ?? null;
            desc = appData.short_description ?? appData.about_the_game ?? '';
            genres = (appData.genres ?? []).map((g: any) => g.description);
          }
        }
      } catch { }

      if (rating === null) {
        rating = await this.steamRating(item.id);
      }

      results.push({
        id: item.id,
        name: item.name,
        cover_url: `https://cdn.akamai.steamstatic.com/steam/apps/${item.id}/library_600x900.jpg`,
        release_year: item.release_date ? new Date(item.release_date).getFullYear() : 0,
        genres,
        sources: ['steam'],
        rating,
        desc,
        platforms: ['pc'],
      });
    }
    return results;
  }

  private async rawgExactSearch(query: string): Promise<SyncSearchResultDto | null> {
    if (!this.raggApiKey) return null;
    try {
      const url = `https://api.rawg.io/api/games?key=${this.raggApiKey}&search=${encodeURIComponent(query)}&search_exact=true&page_size=1`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data: any = await res.json();
      const game = data?.results?.[0];
      if (!game) return null;
      const platforms = GamesSyncService.rawgPlatforms(game.platforms ?? []);
      const rating = game.metacritic ?? (game.rating ? Math.round(game.rating * 20) : null);
      return {
        id: game.id,
        name: game.name,
        cover_url: game.background_image ?? '',
        release_year: game.released ? new Date(game.released).getFullYear() : 0,
        genres: (game.genres ?? []).map((g: any) => g.name),
        sources: ['rawg'],
        rating,
        desc: '',
        platforms,
      };
    } catch {
      return null;
    }
  }

  private async rawgSearch(query: string): Promise<SyncSearchResultDto[]> {
    if (!this.raggApiKey) return [];
    const url = `https://api.rawg.io/api/games?key=${this.raggApiKey}&search=${encodeURIComponent(query)}&page_size=20`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data?.results ?? []).map((game: any) => {
      const rawgPlatforms: { platform: { slug: string } }[] = game.platforms ?? [];
      const platforms = GamesSyncService.rawgPlatforms(rawgPlatforms);
      return {
        id: game.id,
        name: game.name,
        cover_url: game.background_image ?? '',
        release_year: game.released ? new Date(game.released).getFullYear() : 0,
        genres: (game.genres ?? []).map((g: any) => g.name),
        sources: ['rawg'],
        rating: game.metacritic ?? (game.rating ? Math.round(game.rating * 20) : null),
        desc: '',
        platforms,
      };
    });
  }
}
