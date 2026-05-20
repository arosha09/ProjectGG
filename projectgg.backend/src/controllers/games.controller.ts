import { Body, Controller, Get, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GamesService } from "src/services/games.service";
import { AddUserGameDto } from 'src/dto/add-user-game.dto';
import { GetAllGamesDto } from 'src/dto/get-all-games.dto';

@ApiTags('Games')
@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    @Post('add-user-games')
    @ApiBody({ type: AddUserGameDto })
    async addUserGame(@Body() userGame: AddUserGameDto): Promise<AddUserGameDto[]> {
        return this.gamesService.addUserGame(userGame);
    }

    @Get('get-all-gamess')
    async getAllGames(): Promise<GetAllGamesDto[]> {
        return this.gamesService.getAllGames();
    }

    @Get('get-user-games')
    @ApiQuery({ name: 'user_id', type: String, required: true, example: 'user_id    ' })
    async getUserGames(
        @Query('user_id', new ParseUUIDPipe()) userId: string,
    ): Promise<GetAllGamesDto[]> {
        return this.gamesService.getUserGames(userId);
    }

}