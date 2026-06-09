import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiQuery, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { GamesSyncService } from 'src/services/sync/games-sync.service';
import {
  SyncResultDto,
  SyncQueueDto,
  SyncSearchResultDto,
} from 'src/dto/sync/sync.dto';

@ApiTags('Games Sync')
@Controller('games/sync')
export class GamesSyncController {
  constructor(private readonly syncService: GamesSyncService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('queue')
  @ApiQuery({ name: 'force', type: Boolean, required: false })
  @ApiQuery({ name: 'q', type: String, required: false })
  @ApiQuery({ name: 'broken', type: Boolean, required: false })
  async getSyncQueue(
    @Query('force') force?: string,
    @Query('q') q?: string,
    @Query('broken') broken?: string,
  ): Promise<SyncQueueDto[]> {
    const isForce = force === 'true';
    const brokenOnly = broken === 'true';
    return this.syncService.getSyncQueue(isForce, q, brokenOnly);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('search/external')
  @ApiQuery({ name: 'q', type: String, required: true })
  async searchExternal(
    @Query('q') query: string,
  ): Promise<SyncSearchResultDto[]> {
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
  async importGame(
    @Body()
    body: {
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
    },
  ): Promise<any> {
    return this.syncService.createGameFromExternal({
      ...body,
      platforms: body.platforms ?? ['pc'],
      sources: body.sources ?? ['pc'],
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('lock/:code/:column')
  async lockColumn(
    @Param('code') code: string,
    @Param('column') column: string,
  ): Promise<{ locked_columns: string[] }> {
    return this.syncService.toggleLock(code, column, true);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('lock/:code/:column')
  async unlockColumn(
    @Param('code') code: string,
    @Param('column') column: string,
  ): Promise<{ locked_columns: string[] }> {
    return this.syncService.toggleLock(code, column, false);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('missing-series')
  async getMissingSeries(@Req() req: any): Promise<string[]> {
    if (!req.user || req.user.role !== 'admin')
      throw new ForbiddenException('admin required');
    return this.syncService.getMissingSeries();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('series-cover')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSeriesCover(
    @Req() req: any,
    @Body('name') name: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean }> {
    if (!req.user || req.user.role !== 'admin')
      throw new ForbiddenException('admin required');
    if (!name) throw new ForbiddenException('name is required');
    if (!file) throw new ForbiddenException('file is required');
    await this.syncService.uploadSeriesCover(
      name,
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':code')
  async syncGame(
    @Param('code') code: string,
    @Query('name') name?: string,
    @Query('search_only') searchOnly?: string,
  ): Promise<SyncResultDto | SyncSearchResultDto[]> {
    const gameName = name || code;
    if (searchOnly === 'true') {
      return this.syncService.searchExternal(gameName, true);
    }
    return this.syncService.syncGame(code, gameName);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('import-to-game/:code')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        cover_url: { type: 'string' },
        genres: { type: 'array', items: { type: 'string' } },
        external_id: { type: 'string' },
        source: { type: 'string' },
        rating: { type: 'number' },
        release_year: { type: 'number' },
        desc: { type: 'string' },
        platforms: { type: 'array', items: { type: 'string' } },
        sources: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
  })
  async importToGame(
    @Param('code') code: string,
    @Body()
    body: {
      name: string;
      cover_url?: string;
      genres?: string[];
      external_id?: string;
      source?: string;
      rating?: number | null;
      release_year?: number | null;
      desc?: string;
      platforms?: string[];
      sources?: string[];
    },
  ): Promise<SyncResultDto> {
    return this.syncService.importToGame(code, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('force-rawg-desc/:code')
  async forceRawgDesc(
    @Req() req: any,
    @Param('code') code: string,
    @Query('name') name?: string,
  ): Promise<any> {
    if (!req.user || req.user.role !== 'admin')
      throw new ForbiddenException('admin required');
    return this.syncService.forceSetRawgDesc(code, name);
  }
}
