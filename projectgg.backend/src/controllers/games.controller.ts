import { Body, Controller, DefaultValuePipe, Delete, Get, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
    async addUserGame(@Body() userGame: AddUserGameDto): Promise<void> {
        return this.gamesService.addUserGame(userGame);
    }

    @Get('get-all-games')
    @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
    @ApiQuery({ name: 'page_size', type: Number, required: false, example: 10 })
    async getAllGames(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('page_size', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    ): Promise<GetAllGamesDto[]> {
        return this.gamesService.getAllGames(page, pageSize);
    }

    @Get('get-user-games')
    @ApiQuery({ name: 'user_id', type: String, required: true, example: 'user_id' })
    @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
    @ApiQuery({ name: 'page_size', type: Number, required: false, example: 12 })
    async getUserGames(
        @Query('user_id', new ParseUUIDPipe()) userId: string,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('page_size', new DefaultValuePipe(12), ParseIntPipe) pageSize: number,
    ): Promise<GetAllGamesDto[]> {
        return this.gamesService.getUserGames(userId, page, pageSize);
    }

    @Delete('remove-user-games')
    @ApiQuery({ name: 'user_id', type: String, required: true, example: 'user_id' })
    @ApiQuery({ name: 'game_code', type: String, required: true, example: 'AC1' })
    async removeUserGame(
        @Query('user_id', new ParseUUIDPipe()) userId: string,
        @Query('game_code') gameCode: string,
    ): Promise<boolean> {
        return this.gamesService.removeUserGame(userId, gameCode);
    }

    @Get('search')
    @ApiQuery({ name: 'q', type: String, required: true, example: 'assassin' })
    @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
    @ApiQuery({ name: 'page_size', type: Number, required: false, example: 12 })
    async searchGames(
        @Query('q') query: string,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('page_size', new DefaultValuePipe(12), ParseIntPipe) pageSize: number,
    ): Promise<GetAllGamesDto[]> {
        return this.gamesService.searchGames(query, page, pageSize);
    }

}