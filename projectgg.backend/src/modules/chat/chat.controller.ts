import {
  Controller, Get, Post, Delete, Body, Param, Req, UseGuards, Query, Inject,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { DiscordBotService } from './discord-bot.service';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

@ApiTags('Chat')
@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly discordBot: DiscordBotService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
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
    @Body() body: { content: string; channel_id?: string },
  ) {
    const userId = Number(req.user.id);
    const username = req.user.username ?? req.user.email ?? 'Unknown';

    const msg = await this.chatService.saveMessage(
      userId, username, body.content, body.channel_id,
    );

    // Relay to Discord bot
    this.discordBot.sendToDiscord(
      `**${username}**: ${body.content}`,
      body.channel_id,
    );

    this.chatGateway.broadcastMessage(msg);
    return msg;
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
    @Body() body: { content: string; channel_id: string },
  ) {
    const userId = req.user.id;
    const username = req.user.username ?? req.user.email ?? 'Unknown';
    const avatarUrl = req.user.avatar_url ?? null;

    const msg = await this.chatService.saveMessage(
      Number(userId), username, body.content, body.channel_id, avatarUrl,
    );

    this.chatGateway.broadcastMessage(msg);
    return msg;
  }
}
