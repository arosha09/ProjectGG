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

interface VoiceClient {
  socketId: string;
  userId: string;
  guildId: string;
  channelId: string;
}

@WebSocketGateway({
  namespace: '/voice',
  cors: { origin: '*', credentials: true },
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VoiceGateway.name);
  private clients = new Map<string, VoiceClient>(); // socketId -> client info
  private channelMembers = new Map<string, Set<string>>(); // channelId -> Set<socketId>
  private nudgeRateLimit = new Map<string, number[]>(); // userId -> timestamps

  constructor(
    private readonly voiceService: VoiceService,
    private readonly usersRepository: UsersRepository,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Voice client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const info = this.clients.get(client.id);
    if (info) {
      this.removeClient(client.id, info);
    }
    this.logger.log(`Voice client disconnected: ${client.id}`);
  }

  private removeClient(socketId: string, info: VoiceClient): void {
    this.clients.delete(socketId);
    const members = this.channelMembers.get(info.channelId);
    if (members) {
      members.delete(socketId);
      if (members.size === 0) {
        this.channelMembers.delete(info.channelId);
        this.voiceService.leaveChannel(info.guildId);
      } else {
        this.server.to(info.channelId).emit('member-left', { userId: info.userId });
      }
    }
  }

  @SubscribeMessage('join-channel')
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { guildId: string; channelId: string; userId: string },
  ): Promise<void> {
    const { guildId, channelId, userId } = data;
    const prev = this.clients.get(client.id);
    if (prev) { this.removeClient(client.id, prev); client.leave(prev.channelId); }

    await this.voiceService.joinChannel(guildId, channelId);
    this.clients.set(client.id, { socketId: client.id, userId, guildId, channelId });
    client.join(channelId);
    if (!this.channelMembers.has(channelId)) this.channelMembers.set(channelId, new Set());
    this.channelMembers.get(channelId)!.add(client.id);

    const existingMembers = Array.from(this.channelMembers.get(channelId)!)
      .map(sid => this.clients.get(sid))
      .filter((c): c is VoiceClient => c !== undefined && c.socketId !== client.id);
    if (existingMembers.length > 0) {
      client.emit('existing-members', { members: existingMembers.map(m => ({ userId: m.userId })) });
    }

    client.to(channelId).emit('member-joined', { userId });
    this.logger.log(`User ${userId} joined voice channel ${channelId}`);
  }

  @SubscribeMessage('leave-channel')
  async handleLeaveChannel(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    this.removeClient(client.id, info);
    client.leave(info.channelId);
  }

  @SubscribeMessage('audio-frame')
  async handleAudioFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { guildId: string; audio: Buffer },
  ): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    await this.voiceService.playAudio(data.guildId, Buffer.from(data.audio));
    client.to(info.channelId).emit('audio-frame', {
      userId: info.userId,
      audio: data.audio,
    });
  }

  @SubscribeMessage('mute')
  async handleMute(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    client.to(info.channelId).emit('user-muted', { userId: info.userId });
  }

  @SubscribeMessage('unmute')
  async handleUnmute(@ConnectedSocket() client: Socket): Promise<void> {
    const info = this.clients.get(client.id);
    if (!info) return;
    client.to(info.channelId).emit('user-unmuted', { userId: info.userId });
  }

  emitToUser(userId: string, event: string, data: any): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  isInSameChannel(senderId: string, recipientId: string): boolean {
    const senderClient = Array.from(this.clients.values()).find(c => c.userId === senderId);
    if (!senderClient) return false;
    const recipientClient = Array.from(this.clients.values()).find(c => c.userId === recipientId);
    if (!recipientClient) return false;
    return senderClient.channelId === recipientClient.channelId;
  }

  checkNudgeRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.nudgeRateLimit.get(userId) ?? [];
    const recent = timestamps.filter(t => t > now - 5000);
    recent.push(now);
    this.nudgeRateLimit.set(userId, recent);
    return recent.length <= 3;
  }

  async sendNudgeToUser(senderId: string, recipientId: string): Promise<{ success: boolean; reason?: string }> {
    if (!this.checkNudgeRateLimit(senderId)) {
      return { success: false, reason: 'Rate limit exceeded' };
    }

    const recipientSettings = await this.usersRepository.getUserSettings(recipientId);
    if (recipientSettings?.allow_incoming_nudges === false) {
      return { success: false, reason: 'Recipient has disabled incoming nudges' };
    }

    const sender = await this.usersRepository.findById({ userId: senderId });
    const senderUsername = sender?.username ?? senderId;

    this.emitToUser(recipientId, 'voice-nudge', {
      fromUserId: senderId,
      fromUsername: senderUsername,
    });

    return { success: true };
  }
}
