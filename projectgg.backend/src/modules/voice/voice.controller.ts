import {
  Controller, Post, Get, Body, Req, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { VoiceGateway } from './voice.gateway';
import { AccessToken } from 'livekit-server-sdk';

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceGateway: VoiceGateway) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('livekit-token')
  async getLiveKitToken(
    @Req() req: any,
    @Query('channelId') channelId: string,
    @Query('guildId') guildId: string,
  ): Promise<{ token: string; wsUrl: string }> {
    const lkKey = process.env.LK_API_KEY;
    const lkSecret = process.env.LK_API_SECRET;
    const lkUrl = process.env.LK_WS_URL;

    console.log('[LiveKit] Key present:', !!lkKey, 'Secret present:', !!lkSecret, 'Url present:', !!lkUrl);

    if (!lkKey || !lkSecret || !lkUrl) {
      throw new BadRequestException('LiveKit is not configured on this server');
    }
    if (!channelId || !guildId) {
      throw new BadRequestException('channelId and guildId are required');
    }

    const userId = req.user.id;
    const roomName = `gg-${guildId}-${channelId}`;

    const token = new AccessToken(lkKey, lkSecret, {
      identity: userId,
      ttl: '4h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      token: await token.toJwt(),
      wsUrl: lkUrl,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('state')
  getVoiceState(): { channelId: string; guildId: string; userId: string; muted: boolean; deafened: boolean }[] {
    return this.voiceGateway.getVoiceState();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('nudge')
  async sendNudge(
    @Req() req: any,
    @Body() body: { recipientUserId: string },
  ): Promise<{ success: boolean; message?: string }> {
    const senderId = req.user.id;
    const { recipientUserId } = body;

    if (!recipientUserId || typeof recipientUserId !== 'string') {
      throw new BadRequestException('recipientUserId is required');
    }

    if (senderId === recipientUserId) {
      throw new BadRequestException('Cannot nudge yourself');
    }

    const result = await this.voiceGateway.sendNudgeToUser(senderId, recipientUserId);
    return { success: result.success, message: result.reason };
  }
}