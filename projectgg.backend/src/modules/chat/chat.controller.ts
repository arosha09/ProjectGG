import {
  Controller, Get, Post, Body, Req, UseGuards, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { DiscordBotService } from './discord-bot.service';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly discordBot: DiscordBotService,
  ) {}

  @Get('guild')
  getGuild() {
    return {
      channels: this.discordBot.getGuildChannels(),
      voiceMembers: this.discordBot.voiceMembers,
      botReady: this.discordBot.isReady,
    };
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
    const userId = Number(req.user.id);
    const username = req.user.username ?? req.user.email ?? 'Unknown';

    const msg = await this.chatService.saveMessage(
      userId, username, body.content, body.channel_id,
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
