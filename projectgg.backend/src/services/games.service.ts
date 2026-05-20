import { Injectable } from '@nestjs/common';
import { GamesRepository } from 'src/repositories/games.repository';
import { AddUserGameDto } from 'src/dto/add-user-game.dto';
import { GetAllGamesDto } from 'src/dto/get-all-games.dto';

@Injectable()
export class GamesService {
  constructor(private readonly gamesRepository: GamesRepository) {}

  async addUserGame(userGame: AddUserGameDto): Promise<AddUserGameDto[]> {
    return this.gamesRepository.addUserGame(userGame);
  }

  async getAllGames(): Promise<GetAllGamesDto[]> {
    return this.gamesRepository.getAllGames();
  }

  async getUserGames(userId: string): Promise<GetAllGamesDto[]> {
    return this.gamesRepository.getUserGames(userId);
  }
}
