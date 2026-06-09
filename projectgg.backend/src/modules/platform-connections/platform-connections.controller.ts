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
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { PlatformConnectionsService } from './platform-connections.service';

@ApiTags('Platform Connections')
@Controller('platform')
export class PlatformConnectionsController {
  constructor(private readonly service: PlatformConnectionsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('connections')
  @ApiQuery({ name: 'user_id', type: String, required: false })
  async getConnections(@Req() req: any, @Query('user_id') userId?: string) {
    // If user_id is provided, use it. Otherwise, use authenticated user.
    const uid = userId || req.user?.id;
    if (!uid)
      throw new BadRequestException(
        'Provide user_id query param or authenticate',
      );
    return this.service.getConnections(uid);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('link')
  async manualLink(
    @Req() req: any,
    @Body() body: { platform: string; username: string },
  ) {
    await this.service.manualLink(req.user.id, body.platform, body.username);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('unlink/:platform')
  async unlink(@Req() req: any, @Param('platform') platform: string) {
    await this.service.unlink(req.user.id, platform);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('steam/auth-url')
  getSteamAuthUrl(@Req() req: any) {
    return this.service.getSteamAuthUrl(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('steam/validate')
  async validateSteamCallback(
    @Req() req: any,
    @Body() body: { state: string; openidParams: Record<string, string> },
  ) {
    return this.service.handleSteamCallback(body.state, body.openidParams);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('steam/import')
  async importSteamLibrary(@Req() req: any) {
    return this.service.importSteamLibrary(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('discord/auth-url')
  getDiscordAuthUrl(@Req() req: any) {
    return this.service.getDiscordAuthUrl(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('discord/validate')
  async validateDiscordCallback(
    @Req() req: any,
    @Body() body: { state: string; code: string },
  ) {
    return this.service.handleDiscordCallback(body.state, body.code);
  }

  // ============================================================
  // SPOTIFY
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('spotify/auth-url')
  getSpotifyAuthUrl(@Req() req: any) {
    const origin = req.headers?.origin as string | undefined;
    return this.service.getSpotifyAuthUrl(req.user.id, origin);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('spotify/validate')
  async validateSpotifyCallback(
    @Req() req: any,
    @Body() body: { state: string; code: string },
  ) {
    return this.service.handleSpotifyCallback(body.state, body.code);
  }

  // ============================================================
  // YOUTUBE MUSIC
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('youtube/search')
  async searchYoutubeTracks(@Query('q') query: string) {
    return this.service.searchYoutubeTracks(query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('youtube-music/auth-url')
  getYoutubeMusicAuthUrl(@Req() req: any) {
    return this.service.getYoutubeMusicAuthUrl(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('youtube-music/validate')
  async validateYoutubeMusicCallback(
    @Req() req: any,
    @Body() body: { state: string; code: string },
  ) {
    return this.service.handleYoutubeMusicCallback(body.state, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('youtube/playlists')
  async getYoutubePlaylists(@Req() req: any) {
    return this.service.getYoutubePlaylists(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('youtube/playlists/:playlistId/tracks')
  async getYoutubePlaylistTracks(
    @Req() req: any,
    @Param('playlistId') playlistId: string,
  ) {
    return this.service.getYoutubePlaylistTracks(req.user.id, playlistId);
  }

  // ============================================================
  // APPLE MUSIC
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('apple-music/auth-url')
  getAppleMusicAuthUrl(@Req() req: any) {
    return this.service.getAppleMusicAuthUrl(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('apple-music/validate')
  async validateAppleMusicCallback(
    @Req() req: any,
    @Body() body: { state: string; code: string },
  ) {
    return this.service.handleAppleMusicCallback(body.state, body.code);
  }

  // ============================================================
  // MUSIC — Currently Playing
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('music/currently-playing')
  async getMusicCurrentlyPlaying(
    @Req() req: any,
    @Query('platform') platform?: string,
  ) {
    const result = await this.service.getMusicCurrentlyPlaying(
      req.user.id,
      platform,
    );
    if (!result)
      return { statusCode: 404, message: 'No track currently playing' };
    return result;
  }

  // ============================================================
  // MUSIC — Connected Platforms
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('music/connections')
  async getMusicConnections(@Req() req: any) {
    return this.service.getMusicConnections(req.user.id);
  }
}
