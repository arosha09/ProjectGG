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

  private async withImageUrl(
    games: GetAllGamesDto[],
  ): Promise<
    Array<GetAllGamesDto & { imageUrl?: string; series_image_url?: string }>
  > {
    const uniqueSeries = new Set<string>();
    for (const g of games ?? []) {
      if (g.series_name) uniqueSeries.add(g.series_name);
    }

    const seriesUrlMap = new Map<string, string>();
    await Promise.all(
      [...uniqueSeries].map(async (name) => {
        const { data, error } = await this.supabase.storage
          .from(this.bucketName)
          .createSignedUrl(`series/${name}.jpg`, 60 * 60);
        if (!error && data?.signedUrl) {
          seriesUrlMap.set(name, data.signedUrl);
        }
      }),
    );

    return Promise.all(
      (games ?? []).map(async (game) => {
        const filePath = `game/${game.code}.jpg`;
        const { data, error } = await this.supabase.storage
          .from(this.bucketName)
          .createSignedUrl(filePath, 60 * 60);
        return {
          ...game,
          imageUrl: error || !data?.signedUrl ? undefined : data.signedUrl,
          series_image_url: game.series_name
            ? seriesUrlMap.get(game.series_name)
            : undefined,
        };
      }),
    );
  }

  async addUserGame(userGame: AddUserGameDto): Promise<void> {
    const functionName = 'add_user_games';
    const { error } = await this.supabase.rpc(functionName, {
      in_user_id: userGame.in_user_id,
      in_game_code: userGame.in_game_code,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
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
    const functionName = 'get_user_games';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
      page_number: page,
      page_size: pageSize,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }

    const normalizedGames = (data ?? []).map((game: any) => ({
      name: game.name ?? '',
      code: game.code ?? '',
      desc: '',
      total_count: game.total_count,
      sequence_timeline: null,
      sequence_release: null,
      is_series: false,
      series_name: null,
    }));

    return this.withImageUrl(normalizedGames);
  }

  async removeUserGame(userId: string, gameCode: string): Promise<boolean> {
    const functionName = 'remove_user_game';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
      in_game_code: gameCode,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data;
  }
}
