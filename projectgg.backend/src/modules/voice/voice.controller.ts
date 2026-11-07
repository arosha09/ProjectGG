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
import { TrackSource } from '@livekit/protocol';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
  constructor(
    private readonly voiceGateway: VoiceGateway,
    private readonly config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
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
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
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

  /**
   * Gets incoming call status for the authenticated user.
   * Used by the game client to check for calls when the web client initiates one.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('incoming-call')
  async getIncomingCall(
    @Req() req: any,
  ): Promise<{
    has_incoming_call: boolean;
    from_user_id?: string;
    from_username?: string;
    channel_id?: string;
    guild_id?: string;
  }> {
    const userId = req.user.id;
    const result = await this.voiceGateway.getIncomingCall(userId);
    if (!result) {
      return { has_incoming_call: false };
    }
    return {
      has_incoming_call: true,
      from_user_id: result.fromUserId,
      from_username: result.fromUsername,
      channel_id: result.channelId,
      guild_id: result.guildId,
    };
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('invite')
  async sendVoiceInvite(
    @Req() req: any,
    @Body() body: { targetUserId: string; guildId: string; channelId: string },
  ): Promise<{ success: boolean; message?: string }> {
    const senderId = req.user.id;
    const { targetUserId, guildId, channelId } = body;

    if (!targetUserId || !guildId || !channelId) {
      throw new BadRequestException('targetUserId, guildId, and channelId are required');
    }

    if (senderId === targetUserId) {
      throw new BadRequestException('Cannot invite yourself');
    }

    const senderChannel = this.voiceGateway.getUserVoiceChannel(senderId);
    if (!senderChannel) {
      throw new BadRequestException('You must be in a voice channel to send invites');
    }

    const sender = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('username, avatar_url')
      .eq('id', senderId)
      .single();

    const senderName = sender?.data?.username ?? 'Someone';

    this.chatGateway.sendToUser(targetUserId, 'voice-invite-received', {
      fromUserId: senderId,
      fromUsername: senderName,
      fromAvatar: sender?.data?.avatar_url ?? null,
      guildId: senderChannel.guildId,
      channelId: senderChannel.channelId,
    });

    // Store the incoming call so the game can poll for it
    this.voiceGateway.setIncomingCall(targetUserId, {
      fromUserId: senderId,
      fromUsername: senderName,
      guildId: senderChannel.guildId,
      channelId: senderChannel.channelId,
    });

    return { success: true };
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
