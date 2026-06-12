import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { VoiceGateway } from './voice.gateway';
import { AccessToken } from 'livekit-server-sdk';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { ChatService } from '../chat/chat.service';

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
  constructor(
    private readonly voiceGateway: VoiceGateway,
    private readonly config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    private readonly chatService: ChatService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('livekit-token')
  async getLiveKitToken(
    @Req() req: any,
    @Query('channelId') channelId: string,
    @Query('guildId') guildId: string,
  ): Promise<{ token: string; wsUrl: string }> {
    const lkKey = this.config.get<string>('LK_API_KEY');
    const lkSecret = this.config.get<string>('LK_API_SECRET');
    const lkUrl = this.config.get<string>('LK_WS_URL');

    console.log(
      '[LiveKit] ConfigService Key present:',
      !!lkKey,
      '| process.env Key present:',
      !!process.env.LK_API_KEY,
    );

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
  getVoiceState(): {
    channelId: string;
    guildId: string;
    userId: string;
    muted: boolean;
    deafened: boolean;
  }[] {
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

    const result = await this.voiceGateway.sendNudgeToUser(
      senderId,
      recipientUserId,
    );
    return { success: result.success, message: result.reason };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Soundboard (per-server, role-managed)
  // ════════════════════════════════════════════════════════════════════════

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('soundboard/:serverId')
  async getSoundboardSounds(
    @Param('serverId') serverId: number,
  ): Promise<{ id: number; name: string; file_url: string }[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('soundboard_sounds')
      .select('id, name, file_url')
      .eq('server_id', serverId)
      .order('name', { ascending: true });

    if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    return data ?? [];
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('soundboard/:serverId')
  @UseInterceptors(FileInterceptor('file'))
  async addSoundboardSound(
    @Req() req: any,
    @Param('serverId') serverId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
  ): Promise<{ id: number; name: string; file_url: string }> {
    await this.chatService.requirePermission(serverId, req.user.id, 'manage_soundboard');

    if (!file) throw new BadRequestException('No file provided');
    if (!name?.trim()) throw new BadRequestException('Sound name is required');

    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: mp3, ogg, wav, webm');
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File too large (max 5MB)');
    }

    const ext = extname(file.originalname);
    const filename = `soundboard_${serverId}_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;
    const fileBuffer = fs.readFileSync(file.path);

    const { error: uploadError } = await this.supabase.storage
      .from('chat_uploads')
      .upload(filename, fileBuffer, { contentType: file.mimetype });

    fs.unlinkSync(file.path);

    if (uploadError) {
      throw new HttpException(uploadError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { data: signedData, error: signError } = await this.supabase.storage
      .from('chat_uploads')
      .createSignedUrl(filename, 315360000);

    if (signError || !signedData?.signedUrl) {
      throw new HttpException(signError?.message ?? 'Failed to sign URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { data, error: insertError } = await this.supabase
      .schema('projectgg')
      .from('soundboard_sounds')
      .insert({ server_id: serverId, name: name.trim(), file_url: signedData.signedUrl, created_by: req.user.id })
      .select('id, name, file_url')
      .single();

    if (insertError) throw new HttpException(insertError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('soundboard/:serverId/:id')
  async deleteSoundboardSound(
    @Req() req: any,
    @Param('serverId') serverId: number,
    @Param('id') id: number,
  ): Promise<{ success: boolean }> {
    await this.chatService.requirePermission(serverId, req.user.id, 'manage_soundboard');

    const { error } = await this.supabase
      .schema('projectgg')
      .from('soundboard_sounds')
      .delete()
      .eq('id', id)
      .eq('server_id', serverId);

    if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    return { success: true };
  }
}
