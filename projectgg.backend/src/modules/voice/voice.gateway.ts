import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { UsersRepository } from 'src/repositories/users.repository';
import { ChatGateway } from '../chat/chat.gateway';

interface VoiceClient {
  socketId: string;
  userId: string;
  guildId: string;
  channelId: string;
}

interface SoundboardState {
  channelId: string;
  userId: string;
  soundName: string;
}

interface UserVoiceState {
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  themeColor: string;
  screenSharing?: boolean;
  screenShareAudio?: boolean;
  screenShareQuality?: string;
}

@WebSocketGateway({
  namespace: '/voice',
  cors: { origin: '*', credentials: true },
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VoiceGateway.name);
  private clients = new Map<string, VoiceClient>();
  private channelMembers = new Map<string, Set<string>>();
  private userState = new Map<string, UserVoiceState>(); // userId -> state
  private nudgeRateLimit = new Map<string, number[]>();
  private activeSoundboardUsers = new Map<string, SoundboardState>(); // userId -> state

  constructor(
    private readonly voiceService: VoiceService,
    private readonly usersRepository: UsersRepository,
    private readonly chatGateway: ChatGateway,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Voice client connected: ${client.id}`);
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.chatGateway.sendVoiceStateToClient(client.id, this.buildVoiceChannels());
    }
  }

  handleDisconnect(client: Socket): void {
    const info = this.clients.get(client.id);
    if (info) {
      this.removeClient(client.id, info);
    }
    this.logger.log(`Voice client disconnected: ${client.id}`);
  }

  private buildVoiceChannels(): any[] {
    const channelMap = new Map<string, any[]>();
    for (const [socketId, info] of this.clients.entries()) {
      if (!channelMap.has(info.channelId)) channelMap.set(info.channelId, []);
      const state = this.userState.get(info.userId) ?? {
        muted: false,
        deafened: false,
        speaking: false,
        themeColor: '#00ff88',
      };
      channelMap.get(info.channelId)!.push({
        userId: info.userId,
        muted: state.muted,
        deafened: state.deafened,
        speaking: state.speaking,
        themeColor: state.themeColor,
        screenSharing: state.screenSharing ?? false,
        screenShareAudio: state.screenShareAudio ?? false,
        screenShareQuality: state.screenShareQuality ?? null,
      });
    }
    return Array.from(channelMap.entries()).map(
      ([channelId, users]) => ({ channelId, users }),
    );
  }

  private broadcastVoiceState(): void {
    const channels = this.buildVoiceChannels();
    this.chatGateway.server.emit('all-voice-state', { channels });
  }

  private removeClient(
    socketId: string,
    info: VoiceClient,
    socket?: Socket,
  ): void {
    const state = this.userState.get(info.userId);
    const wasSharing = state?.screenSharing ?? false;
    this.clients.delete(socketId);
    this.userState.delete(info.userId);
    this.activeSoundboardUsers.delete(info.userId);
    const members = this.channelMembers.get(info.channelId);
    if (members) {
      members.delete(socketId);
      if (members.size === 0) {
        this.channelMembers.delete(info.channelId);
        this.voiceService.leaveChannel(info.guildId);
      } else {
        const emitter = socket
          ? socket.to(info.channelId)
          : this.server.to(info.channelId);
        emitter.emit('member-left', { userId: info.userId });
        emitter.emit('play-sound', {
          sound: 'voice_leave',
          userId: info.userId,
        });
        if (wasSharing) {
          emitter.emit('user-screen-share-stop', { userId: info.userId });
        }
      }
    }
    this.broadcastVoiceState();
  }

  @SubscribeMessage('join-channel')
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      guildId: string;
      channelId: string;
      userId: string;
      themeColor?: string;
    },
  ): Promise<void> {
    const { guildId, channelId, userId, themeColor } = data;
    const prev = this.clients.get(client.id);
    if (prev) {
      this.removeClient(client.id, prev);
      client.leave(prev.channelId);
    }

    await this.voiceService.joinChannel(guildId, channelId);
    this.clients.set(client.id, {
      socketId: client.id,
      userId,
      guildId,
      channelId,
    });
    this.userState.set(userId, {
      muted: false,
      deafened: false,
      speaking: false,
      themeColor: themeColor ?? '#00ff88',
    });
    client.join(channelId);
    if (!this.channelMembers.has(channelId))
      this.channelMembers.set(channelId, new Set());
    this.channelMembers.get(channelId)!.add(client.id);

    const existingMembers = Array.from(this.channelMembers.get(channelId)!)
      .map((sid) => this.clients.get(sid))
      .filter(
        (c): c is VoiceClient => c !== undefined && c.socketId !== client.id,
      );
    if (existingMembers.length > 0) {
      client.emit('existing-members', {
        members: existingMembers.map((m) => {
          const state = this.userState.get(m.userId) ?? {
            muted: false,
            deafened: false,
            themeColor: '#00ff88',
            screenSharing: false,
          };
          return {
            userId: m.userId,
            muted: state.muted,
            deafened: state.deafened,
            themeColor: state.themeColor,
            screenSharing: state.screenSharing ?? false,
          };
        }),
      });
    }

    client.to(channelId).emit('member-joined', {
      userId,
      muted: false,
      deafened: false,
      themeColor: themeColor ?? '#00ff88',
    });
    client.to(channelId).emit('play-sound', { sound: 'voice_join', userId });
    this.logger.log(`User ${userId} joined voice channel ${channelId}`);
    this.broadcastVoiceState();
  }

  @SubscribeMessage('leave-channel')
  async handleLeaveChannel(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    this.removeClient(client.id, info, client);
    client.leave(info.channelId);
    this.broadcastVoiceState();
  }

  @SubscribeMessage('audio-frame')
  async handleAudioFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { guildId: string; channelId: string; audio: Buffer },
  ): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state?.muted || state?.deafened) return;
    client.to(info.channelId).emit('audio-frame', {
      userId: info.userId,
      audio: data.audio,
    });
  }

  @SubscribeMessage('mute')
  async handleMute(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) state.muted = true;
    client.to(info.channelId).emit('user-muted', { userId: info.userId });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('unmute')
  async handleUnmute(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) state.muted = false;
    client.to(info.channelId).emit('user-unmuted', { userId: info.userId });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('deafen')
  async handleDeafen(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) {
      state.deafened = true;
      state.muted = true;
    }
    client.to(info.channelId).emit('user-deafened', { userId: info.userId });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('undeafen')
  async handleUndeafen(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) {
      state.deafened = false;
      state.muted = false;
    }
    client.to(info.channelId).emit('user-undeafened', { userId: info.userId });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('speaking')
  async handleSpeaking(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) state.speaking = true;
    client.to(info.channelId).emit('user-speaking', { userId: info.userId });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('stopped-speaking')
  async handleStoppedSpeaking(
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) state.speaking = false;
    client
      .to(info.channelId)
      .emit('user-stopped-speaking', { userId: info.userId });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('update-theme-color')
  handleUpdateThemeColor(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { themeColor: string },
  ): void {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) state.themeColor = data.themeColor;
    this.broadcastVoiceState();
  }

  @SubscribeMessage('soundboard-start')
  handleSoundboardStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { soundName: string },
  ): void {
    const info = this.clients.get(client.id);
    if (!info) return;
    this.activeSoundboardUsers.set(info.userId, {
      channelId: info.channelId,
      userId: info.userId,
      soundName: data.soundName,
    });
    client.to(info.channelId).emit('user-soundboard-start', {
      userId: info.userId,
      soundName: data.soundName,
    });
  }

  @SubscribeMessage('soundboard-stop')
  handleSoundboardStop(
    @ConnectedSocket() client: Socket,
  ): void {
    const info = this.clients.get(client.id);
    if (!info) return;
    this.activeSoundboardUsers.delete(info.userId);
    client.to(info.channelId).emit('user-soundboard-stop', {
      userId: info.userId,
    });
  }

  @SubscribeMessage('screen-share-start')
  handleScreenShareStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { quality: string; hasAudio: boolean },
  ): void {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) {
      state.screenSharing = true;
      state.screenShareAudio = data.hasAudio;
      state.screenShareQuality = data.quality;
    }
    this.server.to(info.channelId).emit('user-screen-share-start', {
      userId: info.userId,
      quality: data.quality,
      hasAudio: data.hasAudio,
    });
    this.broadcastVoiceState();
  }

  @SubscribeMessage('screen-share-stop')
  handleScreenShareStop(@ConnectedSocket() client: Socket): void {
    const info = this.clients.get(client.id);
    if (!info) return;
    const state = this.userState.get(info.userId);
    if (state) {
      state.screenSharing = false;
      state.screenShareAudio = false;
      state.screenShareQuality = undefined;
    }
    this.server.to(info.channelId).emit('user-screen-share-stop', {
      userId: info.userId,
    });
    this.broadcastVoiceState();
  }

  emitToUser(userId: string, event: string, data: any): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  isInVoiceChannel(userId: string): boolean {
    return Array.from(this.clients.values()).some((c) => c.userId === userId);
  }

  getUserVoiceChannel(userId: string): { guildId: string; channelId: string } | null {
    const client = Array.from(this.clients.values()).find((c) => c.userId === userId);
    if (!client) return null;
    return { guildId: client.guildId, channelId: client.channelId };
  }

  isInSameChannel(senderId: string, recipientId: string): boolean {
    const senderClient = Array.from(this.clients.values()).find(
      (c) => c.userId === senderId,
    );
    if (!senderClient) return false;
    const recipientClient = Array.from(this.clients.values()).find(
      (c) => c.userId === recipientId,
    );
    if (!recipientClient) return false;
    return senderClient.channelId === recipientClient.channelId;
  }

  checkNudgeRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.nudgeRateLimit.get(userId) ?? [];
    const recent = timestamps.filter((t) => t > now - 5000);
    recent.push(now);
    this.nudgeRateLimit.set(userId, recent);
    return recent.length <= 3;
  }

  async sendNudgeToUser(
    senderId: string,
    recipientId: string,
  ): Promise<{ success: boolean; reason?: string }> {
    if (!this.checkNudgeRateLimit(senderId)) {
      return { success: false, reason: 'Rate limit exceeded' };
    }

    const recipientSettings =
      await this.usersRepository.getUserSettings(recipientId);
    if (recipientSettings?.allow_incoming_nudges === false) {
      return {
        success: false,
        reason: 'Recipient has disabled incoming nudges',
      };
    }

    const sender = await this.usersRepository.findById({ userId: senderId });
    const senderUsername = sender?.username ?? senderId;

    this.chatGateway.sendToUser(recipientId, 'voice-nudge', {
      fromUserId: senderId,
      fromUsername: senderUsername,
    });

    return { success: true };
  }

  getVoiceState(): {
    channelId: string;
    guildId: string;
    userId: string;
    muted: boolean;
    deafened: boolean;
    screenSharing: boolean;
  }[] {
    return Array.from(this.clients.values()).map((c) => {
      const state = this.userState.get(c.userId) ?? {
        muted: false,
        deafened: false,
        speaking: false,
        screenSharing: false,
      };
      return {
        channelId: c.channelId,
        guildId: c.guildId,
        userId: c.userId,
        muted: state.muted,
        deafened: state.deafened,
        screenSharing: state.screenSharing ?? false,
      };
    });
  }
}
