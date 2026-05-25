import {
  Controller, Get, Post, Body, Req, UseGuards, Query, Inject, Inject,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { DiscordBotService } from './discord-bot.service';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly discordBot: DiscordBotService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  @Get('guild')
  getGuild() {
    return {
      channels: this.discordBot.getGuildChannels(),
      voiceMembers: this.discordBot.voiceMembers,
      botReady: this.discordBot.isReady,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('check-discord')
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
  @Get('permissions')
  async getPermissions(@Req() req: any) {
    const userId = req.user.id;
    const { data } = await this.supabase
      .schema('projectgg')
      .from('user_platform_connections')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .single();
    if (!data?.platform_user_id) {
      return { linked: false, permissions: null };
    }
    const perms = await this.discordBot.getUserPermissions(data.platform_user_id);
    return { linked: true, permissions: perms };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('members')
  async getMembers() {
    return this.discordBot.getGuildMembers();
  }

  @Get('history')
  async getHistory(
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getHistory(
      channel || undefined,
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('send')
  async sendMessage(
    @Req() req: any,
    @Body() body: { content: string; channel_id?: string },
  ) {
    const userId = req.user.id;

    // Use Discord username when available
    let username = req.user.username ?? req.user.email ?? 'Unknown';
    try {
      const { data } = await this.supabase
        .schema('projectgg')
        .from('user_platform_connections')
        .select('platform_username')
        .eq('user_id', userId)
        .eq('platform', 'discord')
        .single();
      if (data?.platform_username) {
        username = data.platform_username;
      }
    } catch {
      // fallback to app username
    }

    const msg = await this.chatService.saveMessage(
      Number(userId), username, body.content, body.channel_id,
    );

    // Relay to Discord
    this.discordBot.sendToDiscord(
      `**${username}**: ${body.content}`,
      body.channel_id,
    );

    // Broadcast via WebSocket
    this.chatGateway.broadcastMessage(msg);

    return msg;
  }
}
