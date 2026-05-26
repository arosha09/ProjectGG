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

  constructor(private readonly voiceService: VoiceService) {}

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

    // Send existing members to the newly joined client
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

    // Relay to Discord voice channel
    await this.voiceService.playAudio(data.guildId, Buffer.from(data.audio));

    // Relay to other clients in the same channel
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
}
