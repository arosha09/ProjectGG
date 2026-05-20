import { Injectable, InternalServerErrorException, Inject} from "@nestjs/common";
import { AddUserGameDto } from "src/dto/add-user-game.dto";
import { SUPABASE_CLIENT } from "src/config/supabase.provider";
import { GetAllGamesDto } from "src/dto/get-all-games.dto";

@Injectable()
export class GamesRepository {
    constructor(
        @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    ) {}

    async addUserGame(userGame: AddUserGameDto): Promise<AddUserGameDto[]> {
        const functionName = 'add_user_games';
        const { data, error } = await this.supabase.rpc(functionName, {
            user_id: userGame.user_id,
            game_code: userGame.game_code,
        });
        if (error) {
            throw new InternalServerErrorException(`${functionName} failed: ${error.message}`);
        }
        return data;
    }

    async getAllGames(): Promise<GetAllGamesDto[]> {
        const functionName = 'get_all_games';
        const { data, error } = await this.supabase.rpc(functionName);
        if (error) {
            throw new InternalServerErrorException(`${functionName} failed: ${error.message}`);
        }
        return data;
    }

    async getUserGames(userId: string): Promise<GetAllGamesDto[]> {
        const functionName = 'get_user_games';
        const { data, error } = await this.supabase.rpc(functionName, {
            in_user_id: userId,
        });
        if (error) {
            throw new InternalServerErrorException(`${functionName} failed: ${error.message}`);
        }
        return data;
    }
}