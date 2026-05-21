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

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    configService: ConfigService,
  ) {}

  private async withImageUrl(
    games: GetAllGamesDto[],
  ): Promise<Array<GetAllGamesDto & { imageUrl?: string }>> {
    return Promise.all(
      (games ?? []).map(async (game) => {
        const fileName = `${game.code}.jpg`;
        const { data, error } = await this.supabase.storage
          .from(this.bucketName)
          .createSignedUrl(fileName, 60 * 60);

        if (error || !data?.signedUrl) {
          return {
            ...game,
          };
        }

        return {
          ...game,
          imageUrl: data.signedUrl,
        };
      }),
    );
  }

  async addUserGame(userGame: AddUserGameDto): Promise<AddUserGameDto[]> {
    const functionName = 'add_user_games';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userGame.in_user_id,
      in_game_code: userGame.in_game_code,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data;
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
      name: game.name ?? game.game_name ?? '',
      code: game.code ?? game.game_code ?? '',
      desc: game.desc ?? '',
      total_count: game.total_count,
      sequence_timeline: game.sequence_timeline ?? null,
      sequence_release: game.sequence_release ?? null,
      is_series: game.is_series ?? false,
      series_name: game.series_name ?? null,
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
