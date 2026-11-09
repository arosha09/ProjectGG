import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GamesService } from 'src/services/games.service';
import { AddUserGameDto } from 'src/dto/add-user-game.dto';
import { GetAllGamesDto } from 'src/dto/get-all-games.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@ApiTags('Games')
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('add-user-games')
  @ApiBody({ type: AddUserGameDto })
  async addUserGame(
    @Req() req: any,
    @Body() userGame: AddUserGameDto,
  ): Promise<void> {
    const targetUserId =
      req.user.role === 'admin' ? userGame.in_user_id : req.user.id;
    return this.gamesService.addUserGame({
      ...userGame,
      in_user_id: targetUserId,
    });
  }

  @Get('get-all-games')
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'page_size', type: Number, required: false, example: 10 })
  async getAllGames(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(10), ParseIntPipe)
    pageSize: number,
  ): Promise<GetAllGamesDto[]> {
    return this.gamesService.getAllGames(page, pageSize);
  }

  @Get('get-user-games')
  @ApiQuery({
    name: 'user_id',
    type: String,
    required: true,
    example: 'user_id',
  })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'page_size', type: Number, required: false, example: 12 })
  async getUserGames(
    @Query('user_id', new ParseUUIDPipe()) userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(12), ParseIntPipe)
    pageSize: number,
  ): Promise<GetAllGamesDto[]> {
    return this.gamesService.getUserGames(userId, page, pageSize);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('remove-user-games')
  @ApiQuery({
    name: 'user_id',
    type: String,
    required: true,
    example: 'user_id',
  })
  @ApiQuery({ name: 'game_code', type: String, required: true, example: 'AC1' })
  async removeUserGame(
    @Req() req: any,
    @Query('user_id', new ParseUUIDPipe()) userId: string,
    @Query('game_code') gameCode: string,
  ): Promise<boolean> {
    const targetUserId = req.user.role === 'admin' ? userId : req.user.id;
    return this.gamesService.removeUserGame(targetUserId, gameCode);
  }

  @Get('search')
  @ApiQuery({ name: 'q', type: String, required: true, example: 'assassin' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'page_size', type: Number, required: false, example: 12 })
  async searchGames(
    @Query('q') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(12), ParseIntPipe)
    pageSize: number,
  ): Promise<GetAllGamesDto[]> {
    return this.gamesService.searchGames(query, page, pageSize);
  }

  @Get('series/:seriesName')
  async getGamesBySeries(
    @Param('seriesName') seriesName: string,
  ): Promise<GetAllGamesDto[]> {
    return this.gamesService.getGamesBySeries(seriesName);
  }

  @Get('library-total')
  async getLibraryTotal(): Promise<{ total: number }> {
    const total = await this.gamesService.getLibraryTotal();
    return { total };
  }
}
