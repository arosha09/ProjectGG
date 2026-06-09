import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { MusicService } from './music.service';

@ApiTags('Music')
@Controller('music')
export class MusicController {
  constructor(private readonly service: MusicService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('playlists')
  async getPlaylists(@Req() req: any) {
    return this.service.getPlaylists(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('playlists')
  async createPlaylist(@Req() req: any, @Body() body: { name: string }) {
    return this.service.createPlaylist(req.user.id, body.name);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('playlists/save')
  async savePlaylistTracks(
    @Req() req: any,
    @Body() body: { name: string; tracks: any[] },
  ) {
    return this.service.savePlaylistTracks(req.user.id, body.name, body.tracks);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('playlists/:id/tracks')
  async addTrack(
    @Param('id') id: string,
    @Body()
    body: {
      videoId: string;
      title: string;
      artist: string;
      thumbnail: string | null;
    },
  ) {
    return this.service.addTrackToPlaylist(Number(id), body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('playlists/:playlistId/tracks/:trackIndex')
  async removeTrack(
    @Param('playlistId') playlistId: string,
    @Param('trackIndex') trackIndex: string,
  ) {
    return this.service.removeTrackFromPlaylist(
      Number(playlistId),
      Number(trackIndex),
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('playlists/:id')
  async deletePlaylist(@Param('id') id: string) {
    return this.service.deletePlaylist(Number(id));
  }
}
