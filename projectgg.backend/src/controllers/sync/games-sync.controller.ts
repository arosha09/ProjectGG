import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { GamesSyncService } from 'src/services/sync/games-sync.service';
import { SyncResultDto, SyncQueueDto, SyncSearchResultDto } from 'src/dto/sync/sync.dto';

@ApiTags('Games Sync')
@Controller('games/sync')
export class GamesSyncController {
  constructor(private readonly syncService: GamesSyncService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('queue')
  async getSyncQueue(): Promise<SyncQueueDto[]> {
    return this.syncService.getSyncQueue();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':code')
  async syncGame(@Param('code') code: string, @Query('name') name?: string): Promise<SyncResultDto> {
    const gameName = name || code;
    return this.syncService.syncGame(code, gameName);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('search/external')
  @ApiQuery({ name: 'q', type: String, required: true })
  async searchExternal(@Query('q') query: string): Promise<SyncSearchResultDto[]> {
    return this.syncService.searchExternal(query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('import')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        cover_url: { type: 'string' },
        genres: { type: 'array', items: { type: 'string' } },
        external_id: { type: 'string' },
        external_source: { type: 'string' },
        rating: { type: 'number' },
        release_year: { type: 'number' },
        desc: { type: 'string' },
        platforms: { type: 'array', items: { type: 'string' } },
        sources: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
  })
  async importGame(@Body() body: {
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
    return this.syncService.createGameFromExternal({
      ...body,
      platforms: body.platforms ?? ['pc'],
      sources: body.sources ?? ['pc'],
    });
  }
}
