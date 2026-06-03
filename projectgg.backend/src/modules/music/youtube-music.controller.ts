import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { YouTubeMusicService, YTMusicSearchResult, YTMusicPlaylist, YTMusicPlaylistTrack } from './youtube-music.service';

@ApiTags('YouTube Music')
@Controller('youtube-music')
export class YouTubeMusicController {
  constructor(private readonly ytMusic: YouTubeMusicService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('search')
  @ApiQuery({ name: 'q', type: String, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<YTMusicSearchResult[]> {
    return this.ytMusic.searchAll(query, limit ? parseInt(limit, 10) : 20);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('playlist/:playlistId')
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getPlaylist(
    @Param('playlistId') playlistId: string,
    @Query('limit') limit?: string,
  ): Promise<YTMusicPlaylistTrack[]> {
    return this.ytMusic.getPlaylist(playlistId, limit ? parseInt(limit, 10) : 50);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('library/playlists')
  async getUserPlaylists(): Promise<YTMusicPlaylist[]> {
    return this.ytMusic.getUserPlaylists();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('artist/:name/tracks')
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getArtistTracks(
    @Param('name') name: string,
    @Query('limit') limit?: string,
  ): Promise<YTMusicSearchResult[]> {
    return this.ytMusic.getArtistTracks(decodeURIComponent(name), limit ? parseInt(limit, 10) : 10);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('related/:videoId')
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getRelated(
    @Param('videoId') videoId: string,
    @Query('limit') limit?: string,
  ): Promise<YTMusicSearchResult[]> {
    return this.ytMusic.getRelatedTracks(videoId, limit ? parseInt(limit, 10) : 10);
  }
}
