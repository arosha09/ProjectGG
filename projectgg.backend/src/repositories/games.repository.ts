import {
  Injectable,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AddUserGameDto } from 'src/dto/add-user-game.dto';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { GetAllGamesDto } from 'src/dto/get-all-games.dto';

@Injectable()
export class GamesRepository {
  private readonly bucketName = 'game_image';
  private readonly supabaseUrl: string;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    configService: ConfigService,
  ) {
    this.supabaseUrl = configService.get<string>('SUPABASE_URL') ?? '';
  }

  private inferTier(rating?: number | null): string {
    const value = typeof rating === 'number' ? rating : null;
    if (value === null) return 'common';
    if (value >= 90) return 'legendary';
    if (value >= 80) return 'epic';
    if (value >= 70) return 'rare';
    if (value >= 50) return 'uncommon';
    return 'common';
  }

  private async withImageUrl(
    games: GetAllGamesDto[],
  ): Promise<
    Array<GetAllGamesDto & { imageUrl?: string; series_image_url?: string }>
  > {
    const uniqueSeries = new Set<string>();
    for (const g of games ?? []) {
      if (g.series_name) uniqueSeries.add(g.series_name);
    }

    const seriesExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const seriesUrlMap = new Map<string, string>();
    await Promise.all(
      [...uniqueSeries].map(async (name) => {
        for (const encoded of [encodeURIComponent(name), name]) {
          for (const ext of seriesExts) {
            const filePath = `series/${encoded}${ext}`;
            const { data, error } = await this.supabase.storage
              .from(this.bucketName)
              .createSignedUrl(filePath, 60 * 60);
            if (!error && data?.signedUrl) {
              seriesUrlMap.set(name, data.signedUrl);
              return;
            }
          }
        }
      }),
    );

    return Promise.all(
      (games ?? []).map(async (game) => {
        let coverUrl = game.cover_url;
        if (!coverUrl) {
          const filePath = `game/${encodeURIComponent(game.code)}.jpg`;
          const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .createSignedUrl(filePath, 60 * 60);
          if (!error && data?.signedUrl) {
            coverUrl = data.signedUrl;
          }
        }
        return {
          ...game,
          cover_url: coverUrl,
          series_image_url: game.series_name
            ? seriesUrlMap.get(game.series_name)
            : undefined,
        };
      }),
    );
  }

  async addUserGame(userGame: AddUserGameDto): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id')
      .eq('user_id', userGame.in_user_id)
      .eq('game_code', userGame.in_game_code)
      .maybeSingle();

    if (existingError) {
      throw new InternalServerErrorException(
        `Add user game lookup failed: ${existingError.message}`,
      );
    }

    if (existing) {
      return;
    }

    const { data: game, error: gameError } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code,tier,rating')
      .eq('code', userGame.in_game_code)
      .maybeSingle();

    if (gameError) {
      throw new InternalServerErrorException(
        `Add user game lookup failed: ${gameError.message}`,
      );
    }

    const tier = game?.tier ?? this.inferTier(game?.rating ?? null);

    const { error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .insert({
        user_id: userGame.in_user_id,
        game_code: userGame.in_game_code,
        tier,
        xp_earned: 0,
        is_favorite: false,
        drawn_at: new Date().toISOString(),
      });
    if (error) {
      throw new InternalServerErrorException(
        `Add user game failed: ${error.message}`,
      );
    }
  }

  async removeUserGame(userId: string, gameCode: string): Promise<boolean> {
    const { error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .delete()
      .eq('user_id', userId)
      .eq('game_code', gameCode);
    if (error) {
      throw new InternalServerErrorException(
        `Remove user game failed: ${error.message}`,
      );
    }
    return true;
  }

  async getAllGames(page = 1, pageSize = 12): Promise<GetAllGamesDto[]> {
    const functionName = 'get_all_games';
    const { data, error } = await this.supabase.rpc(functionName, {
      page_size: pageSize,
      page_number: page,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return this.withImageUrl(data ?? []);
  }

  async getUserGames(
    userId: string,
    page = 1,
    pageSize = 12,
  ): Promise<GetAllGamesDto[]> {
    const { data: collection, error: collectionError } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('game_code, tier, is_favorite, drawn_at')
      .eq('user_id', userId)
      .order('drawn_at', { ascending: false })
      .limit(Math.max(pageSize, 1000));

    if (collectionError) {
      throw new InternalServerErrorException(
        `get_user_games failed: ${collectionError.message}`,
      );
    }

    const codes = [
      ...new Set(
        (collection ?? []).map((row: any) => row.game_code).filter(Boolean),
      ),
    ];
    if (codes.length === 0) return [];

    const { data: games, error: gamesError } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select(
        'name,code,desc,sequence_timeline,sequence_release,is_series,series_name,genres,cover_url,external_id,rating,platforms,sources,last_synced_at',
      )
      .in('code', codes);

    if (gamesError) {
      throw new InternalServerErrorException(
        `get_user_games failed: ${gamesError.message}`,
      );
    }

    const gameMap = new Map<string, any>(
      (games ?? []).map((game: any) => [game.code, game]),
    );
    const normalizedGames = (collection ?? []).map((row: any) => {
      const game = gameMap.get(row.game_code) ?? {};
      return {
        name: game.name ?? '',
        code: game.code ?? row.game_code ?? '',
        desc: game.desc ?? '',
        total_count: codes.length,
        sequence_timeline: game.sequence_timeline ?? null,
        sequence_release: game.sequence_release ?? null,
        is_series: game.is_series ?? false,
        series_name: game.series_name ?? null,
        genres: game.genres ?? [],
        cover_url: game.cover_url ?? undefined,
        external_id: game.external_id ?? undefined,
        rating: game.rating ?? null,
        platforms: game.platforms ?? ['pc'],
        sources: game.sources ?? ['pc'],
        tier: row.tier ?? game.tier ?? undefined,
        is_favorite: row.is_favorite ?? false,
        drawn_at: row.drawn_at ?? undefined,
      };
    });

    return this.withImageUrl(normalizedGames);
  }

  async searchGames(
    query: string,
    page = 1,
    pageSize = 12,
  ): Promise<GetAllGamesDto[]> {
    const functionName = 'search_games';
    const { data, error } = await this.supabase.rpc(functionName, {
      search_query: query,
      page_size: pageSize,
      page_number: page,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return this.withImageUrl(data ?? []);
  }

  async getGamesBySeries(seriesName: string): Promise<GetAllGamesDto[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select(
        'name,code,desc,sequence_timeline,sequence_release,is_series,series_name,genres,cover_url,external_id,rating,platforms,sources,last_synced_at',
      )
      .eq('series_name', seriesName)
      .order('sequence_release', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        `get_games_by_series failed: ${error.message}`,
      );
    }
    return this.withImageUrl(data ?? []);
  }
}
