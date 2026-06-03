import {
  Controller, Post, Get, Body, Req, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { VoiceGateway } from './voice.gateway';

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceGateway: VoiceGateway) {}

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