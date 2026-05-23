import { Injectable } from '@nestjs/common';
import { GamesRepository } from 'src/repositories/games.repository';
import { AddUserGameDto } from 'src/dto/add-user-game.dto';
import { GetAllGamesDto } from 'src/dto/get-all-games.dto';

@Injectable()
export class GamesService {
  constructor(private readonly gamesRepository: GamesRepository) {}

  async addUserGame(userGame: AddUserGameDto): Promise<void> {
    return this.gamesRepository.addUserGame(userGame);
  }

  async getAllGames(page = 1, pageSize = 12): Promise<GetAllGamesDto[]> {
    return this.gamesRepository.getAllGames(page, pageSize);
  }

  async getUserGames(userId: string, page = 1, pageSize = 12): Promise<GetAllGamesDto[]> {
    return this.gamesRepository.getUserGames(userId, page, pageSize);
  }

  async removeUserGame(userId: string, gameCode: string): Promise<boolean> {
    return this.gamesRepository.removeUserGame(userId, gameCode);
  }
}

