import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { SyncResultDto, SyncSearchResultDto } from 'src/dto/sync/sync.dto';

@Injectable()
export class GamesSyncService {
  private readonly raggApiKey: string;

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

  async getSyncQueue(): Promise<{ code: string; name: string }[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code, name')
      .is('cover_url', null)
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  async syncGame(code: string, name: string): Promise<SyncResultDto> {
    const steamResult = await this.trySteam(name, code);
    if (steamResult.success) {
      try { await this.persistSync(code, steamResult); } catch { }
      return steamResult;
    }

    const gogResult = await this.tryGOG(name, code);
    if (gogResult.success) {
      try { await this.persistSync(code, gogResult); } catch { }
      return gogResult;
    }

    const raggResult = await this.tryRAWG(name, code);
    if (raggResult.success) {
      try { await this.persistSync(code, raggResult); } catch { }
      return raggResult;
    }

    return { code, success: false, message: 'Not found on Steam, GOG, or RAWG' };
  }

  async createGameFromExternal(data: {
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
  }): Promise<any> {
    const { data: result, error } = await this.supabase.rpc('create_game_from_external', {
      in_name: data.name,
      in_code: null,
      in_desc: data.desc ?? null,
      in_cover_url: data.cover_url ?? null,
      in_genres: data.genres ?? null,
      in_external_id: data.external_id ?? null,
      in_external_source: data.external_source ?? data.sources?.[0] ?? null,
      in_rating: data.rating ?? null,
      in_release_year: data.release_year ?? null,
      in_is_series: false,
      in_series_name: null,
      in_platforms: data.platforms ?? ['pc'],
      in_sources: data.sources ?? ['pc'],
    });

    if (error) throw error;
    return result;
  }

  private async persistSync(
    code: string,
    result: SyncResultDto,
  ): Promise<void> {
    const extId = result.external_id
      ?? (result.source === 'steam' && result.cover_url
        ? result.cover_url.match(/\/apps\/(\d+)\//)?.[1] ?? null
        : null);
    const { error } = await this.supabase.rpc('update_game_external', {
      in_code: code,
      in_cover_url: result.cover_url ?? null,
      in_genres: result.genres ?? null,
      in_external_id: extId,
      in_external_source: result.source ?? null,
      in_rating: result.rating ?? null,
      in_release_year: result.release_year ?? null,
      in_desc: result.desc ?? null,
      in_platforms: result.platforms ?? null,
      in_sources: result.sources ?? null,
    });
    if (error) throw error;
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
