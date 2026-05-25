import {
  Controller, Get, Post, Delete, Body, Param, Req, UseGuards, Query, Inject,
  UseInterceptors, UploadedFile, BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { DiscordBotService } from './discord-bot.service';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { randomBytes } from 'crypto';
import { extname } from 'path';
import * as fs from 'fs';

@ApiTags('Chat')
@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly discordBot: DiscordBotService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    private readonly configService: ConfigService,
  ) {}

  // ================================================================
  // LEGACY DISCORD ENDPOINTS (keep for backward compat)
  // ================================================================

  @Get('chat/guild')
  getGuild() {
    return {
      channels: this.discordBot.getGuildChannels(),
      voiceMembers: this.discordBot.voiceMembers,
      botReady: this.discordBot.isReady,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/check-discord')
  async checkDiscord(@Req() req: any) {
    const userId = req.user.id;
    const { data } = await this.supabase
      .schema('projectgg')
      .from('user_platform_connections')
      .select('platform_username, platform_user_id')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .single();
    return { linked: !!data, discordUsername: data?.platform_username ?? null };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/permissions')
  async getPermissions(@Req() req: any) {
    const userId = req.user.id;
    const { data } = await this.supabase
      .schema('projectgg')
      .from('user_platform_connections')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .single();
    if (!data?.platform_user_id) return { linked: false, permissions: null };
    const perms = await this.discordBot.getUserPermissions(data.platform_user_id);
    return { linked: true, permissions: perms };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/members')
  async getMembers() {
    return this.discordBot.getGuildMembers();
  }

  // DISCORD CHAT — MESSAGES (synced with Discord guild)

  @Get('chat/history')
  async getHistory(@Query('channel') channel?: string, @Query('limit') limit?: string) {
    // Backfill Discord history into DB if needed (idempotent — skips if already populated)
    if (channel) {
      await this.discordBot.backfillChannel(channel).catch(() => {});
    }
    return this.chatService.getHistory(
      channel || undefined,
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('chat/send')
  async sendMessage(
    @Req() req: any,
    @Body() body: { content: string; channel_id?: string; reply_to?: number; attachment_url?: string },
  ) {
    const userId = Number(req.user.id);
    const username = req.user.username ?? req.user.email ?? 'Unknown';

    const msg = await this.chatService.saveMessage(
      userId, username, body.content, body.channel_id, undefined, body.reply_to, body.attachment_url,
    );

    // Relay to Discord bot
    let discordContent = `**${username}**: ${body.content}`;
    if (body.attachment_url) discordContent += `\n${body.attachment_url}`;
    this.discordBot.sendToDiscord(discordContent, body.channel_id);

    this.chatGateway.broadcastMessage(msg);
    return msg;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('chat/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: jpeg, png, gif, webp, mp4');
    }

    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File too large (max 25MB)');
    }

    const ext = extname(file.originalname);
    const filename = `chat_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;

    const fileBuffer = fs.readFileSync(file.path);

    const { error: uploadError } = await this.supabase.storage
      .from('chat_uploads')
      .upload(filename, fileBuffer, { contentType: file.mimetype });

    fs.unlinkSync(file.path);

    if (uploadError) {
      throw new HttpException(uploadError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { data: { publicUrl } } = this.supabase.storage
      .from('chat_uploads')
      .getPublicUrl(filename);

    return { url: publicUrl };
  }

  private readonly fallbackGifs = [
    { id: 'wave', url: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy.gif', preview: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy-downsized-small.gif', title: 'Wave' },
    { id: 'hype', url: 'https://media0.giphy.com/media/l0HlNaQ6gW0X7l6qY/giphy.gif', preview: 'https://media0.giphy.com/media/l0HlNaQ6gW0X7l6qY/giphy-downsized-small.gif', title: 'Hype' },
    { id: 'laugh', url: 'https://media2.giphy.com/media/l0HlTy9QUVqYjgxHy/giphy.gif', preview: 'https://media2.giphy.com/media/l0HlTy9QUVqYjgxHy/giphy-downsized-small.gif', title: 'Laugh' },
    { id: 'shrug', url: 'https://media4.giphy.com/media/10zfF42YbPLnwI/giphy.gif', preview: 'https://media4.giphy.com/media/10zfF42YbPLnwI/giphy-downsized-small.gif', title: 'Shrug' },
    { id: 'wow', url: 'https://media2.giphy.com/media/3oriO0OEd9QIDdllqE/giphy.gif', preview: 'https://media2.giphy.com/media/3oriO0OEd9QIDdllqE/giphy-downsized-small.gif', title: 'Wow' },
    { id: 'party', url: 'https://media1.giphy.com/media/xT8qBf6V1MNs8oI3ni/giphy.gif', preview: 'https://media1.giphy.com/media/xT8qBf6V1MNs8oI3ni/giphy-downsized-small.gif', title: 'Party' },
    { id: 'think', url: 'https://media0.giphy.com/media/1BXa2alBjrCXC/giphy.gif', preview: 'https://media0.giphy.com/media/1BXa2alBjrCXC/giphy-downsized-small.gif', title: 'Think' },
    { id: 'fire', url: 'https://media3.giphy.com/media/3o7aD2sa1jK4F3f5Wc/giphy.gif', preview: 'https://media3.giphy.com/media/3o7aD2sa1jK4F3f5Wc/giphy-downsized-small.gif', title: 'Fire' },
    { id: 'cry', url: 'https://media1.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', preview: 'https://media1.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy-downsized-small.gif', title: 'Cry' },
    { id: 'yes', url: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy.gif', preview: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy-downsized-small.gif', title: 'Yes' },
    { id: 'no', url: 'https://media2.giphy.com/media/3o7btT1TBYmX2mY3eE/giphy.gif', preview: 'https://media2.giphy.com/media/3o7btT1TBYmX2mY3eE/giphy-downsized-small.gif', title: 'No' },
    { id: 'eyes', url: 'https://media3.giphy.com/media/26ufdip6qU2Hm7CBu/giphy.gif', preview: 'https://media3.giphy.com/media/26ufdip6qU2Hm7CBu/giphy-downsized-small.gif', title: 'Eyes' },
  ];

  @Get('chat/gifs')
  async searchGifs(@Query('q') q?: string, @Query('limit') limit?: string) {
    const query = q || '';
    const limitNum = limit ? Math.min(Number(limit), 50) : 12;

    const key = this.configService.get<string>('GIPHY_API_KEY');
    if (key) {
      try {
        const endpoint = query
          ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=${limitNum}`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=${limitNum}`;
        const res = await fetch(endpoint);
        const data = await res.json();
        if (data?.data?.length) {
          return {
            results: data.data.map((r: any) => ({
              id: r.id,
              url: r.images?.original?.url,
              preview: r.images?.fixed_width_small?.url,
              title: r.title,
            })),
          };
        }
      } catch {}
    }

    const filtered = query
      ? this.fallbackGifs.filter(g => g.title.toLowerCase().includes(query.toLowerCase()))
      : this.fallbackGifs;
    return { results: filtered.slice(0, limitNum) };
  }

  @Get('chat/gifs/trending')
  async trendingGifs() {
    return this.searchGifs('', '12');
  }

  // ================================================================
  // GG CHAT — SERVERS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers')
  async getServers(@Req() req: any) {
    return this.chatService.getServers(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers')
  async createServer(@Req() req: any, @Body() body: { name: string }) {
    if (!body.name?.trim()) throw new Error('Server name required');
    const server = await this.chatService.createServer(body.name.trim(), req.user.id);
    return server;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/servers/:id')
  async deleteServer(@Req() req: any, @Param('id') id: string) {
    await this.chatService.deleteServer(Number(id), req.user.id);
    return { success: true };
  }

  // ================================================================
  // GG CHAT — CHANNELS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers/:serverId/channels')
  async getChannels(@Param('serverId') serverId: string) {
    return this.chatService.getChannels(Number(serverId));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/channels')
  async createChannel(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Body() body: { name: string; type: 'text' | 'voice' },
  ) {
    return this.chatService.createChannel(Number(serverId), body.name, body.type ?? 'text', req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/channels/:id')
  async deleteChannel(@Req() req: any, @Param('id') id: string) {
    await this.chatService.deleteChannel(Number(id), req.user.id);
    return { success: true };
  }

  // ================================================================
  // GG CHAT — MEMBERS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers/:serverId/members')
  async getServerMembers(@Param('serverId') serverId: string) {
    return this.chatService.getServerMembers(Number(serverId));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/join')
  async joinServer(@Req() req: any, @Param('serverId') serverId: string) {
    await this.chatService.joinServer(Number(serverId), req.user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/leave')
  async leaveServer(@Req() req: any, @Param('serverId') serverId: string) {
    await this.chatService.leaveServer(Number(serverId), req.user.id);
    return { success: true };
  }

  // ================================================================
  // GG CHAT — MESSAGES
  // ================================================================

  @Get('gg/history')
  async getGgHistory(@Query('channel') channel?: string, @Query('limit') limit?: string) {
    return this.chatService.getHistory(
      channel || undefined,
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/send')
  async sendGgMessage(
    @Req() req: any,
    @Body() body: { content: string; channel_id: string; reply_to?: number; attachment_url?: string },
  ) {
    const userId = req.user.id;
    const username = req.user.username ?? req.user.email ?? 'Unknown';
    const avatarUrl = req.user.avatar_url ?? null;

    const msg = await this.chatService.saveMessage(
      Number(userId), username, body.content, body.channel_id, avatarUrl, body.reply_to, body.attachment_url,
    );

    this.chatGateway.broadcastMessage(msg);
    return msg;
  }
}
