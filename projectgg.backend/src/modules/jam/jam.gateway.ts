import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JamService } from './jam.service';
import { JamTrack } from './jam.types';

@WebSocketGateway({ namespace: '/jam', cors: { origin: '*' } })
export class JamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(JamGateway.name);
  private socketToUser = new Map<string, string>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly jamService: JamService) {}

  handleConnection(client: Socket): void {
    const userId = client.handshake.query.userId as string;
    if (!userId) {
      client.disconnect();
      return;
    }

    client.data.userId = userId;
    this.socketToUser.set(client.id, userId);

    const session = this.jamService.get_user_session(userId);
    if (session) {
      client.join(`jam:${session.id}`);
      client.emit('jam:state', this.jamService.to_state(session));
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = this.socketToUser.get(client.id);
    this.socketToUser.delete(client.id);
    if (!userId) return;
    this.logger.log(
      `Jam socket disconnected for ${userId} (kept in session until explicit leave)`,
    );
  }

  @SubscribeMessage('jam:sync-request')
  handleSyncRequest(@ConnectedSocket() client: Socket): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;
    client.emit('jam:state', this.jamService.to_state(session));
  }

  @SubscribeMessage('jam:play')
  handlePlay(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { currentTime?: number },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_play_pause(userId, session)) {
      client.emit('jam:control-denied', { action: 'play' });
      return;
    }

    this.jamService.set_playing(userId, true, data?.currentTime);
    this.server.to(`jam:${session.id}`).emit('jam:playback-sync', {
      isPlaying: true,
      currentTime: this.jamService.get_adjusted_time(session),
      triggeredBy: userId,
    });
  }

  @SubscribeMessage('jam:pause')
  handlePause(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { currentTime?: number },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_play_pause(userId, session)) {
      client.emit('jam:control-denied', { action: 'pause' });
      return;
    }

    this.jamService.set_playing(userId, false, data?.currentTime);
    this.server.to(`jam:${session.id}`).emit('jam:playback-sync', {
      isPlaying: false,
      currentTime: data?.currentTime ?? session.currentTime,
      triggeredBy: userId,
    });
  }

  @SubscribeMessage('jam:seek')
  handleSeek(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { time: number },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_play_pause(userId, session)) {
      client.emit('jam:control-denied', { action: 'seek' });
      return;
    }

    this.jamService.seek_to(userId, data.time);
    this.server.to(`jam:${session.id}`).emit('jam:playback-sync', {
      isPlaying: session.isPlaying,
      currentTime: data.time,
      triggeredBy: userId,
    });
  }

  @SubscribeMessage('jam:track-changed')
  handleTrackChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { track: JamTrack | null },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.set_current_track(userId, data.track);
    if (!session) return;

    this.jamService.set_playing(userId, true, 0);
    this.server.to(`jam:${session.id}`).emit('jam:track-changed', {
      track: data.track,
      currentTime: 0,
      isPlaying: true,
      triggeredBy: userId,
    });
  }

  @SubscribeMessage('jam:skip-next')
  handleSkipNext(@ConnectedSocket() client: Socket): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_skip(userId, session)) {
      client.emit('jam:control-denied', { action: 'skip-next' });
      return;
    }

    const result = this.jamService.next_track(userId);
    if (!result) return;

    this.server.to(`jam:${result.session.id}`).emit('jam:track-changed', {
      track: result.track,
      currentTime: 0,
      isPlaying: !!result.track,
      triggeredBy: userId,
    });

    this.server.to(`jam:${result.session.id}`).emit('jam:queue-updated', {
      queue: result.session.queue,
    });
  }

  @SubscribeMessage('jam:skip-prev')
  handleSkipPrev(@ConnectedSocket() client: Socket): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_skip(userId, session)) {
      client.emit('jam:control-denied', { action: 'skip-prev' });
      return;
    }

    this.jamService.seek_to(userId, 0);
    this.server.to(`jam:${session.id}`).emit('jam:playback-sync', {
      isPlaying: true,
      currentTime: 0,
      triggeredBy: userId,
    });
  }

  @SubscribeMessage('jam:add-to-queue')
  handleAddToQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { track: JamTrack },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_add_songs(userId, session)) {
      client.emit('jam:control-denied', { action: 'add-to-queue' });
      return;
    }

    const result = this.jamService.add_to_queue(userId, data.track);
    if (!result) return;

    this.server.to(`jam:${result.session.id}`).emit('jam:queue-updated', {
      queue: result.session.queue,
      addedBy: userId,
    });
  }

  @SubscribeMessage('jam:remove-from-queue')
  handleRemoveFromQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { position: number },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_add_songs(userId, session)) {
      client.emit('jam:control-denied', { action: 'remove-from-queue' });
      return;
    }

    const updated = this.jamService.remove_from_queue(userId, data.position);
    if (!updated) return;

    this.server.to(`jam:${updated.id}`).emit('jam:queue-updated', {
      queue: updated.queue,
    });
  }

  @SubscribeMessage('jam:play-from-queue')
  handlePlayFromQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { position: number },
  ): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    if (!this.jamService.can_add_songs(userId, session)) {
      client.emit('jam:control-denied', { action: 'play-from-queue' });
      return;
    }

    const result = this.jamService.play_from_queue(userId, data.position);
    if (!result) return;

    this.server.to(`jam:${result.session.id}`).emit('jam:track-changed', {
      track: result.track,
      currentTime: 0,
      isPlaying: true,
      triggeredBy: userId,
    });

    this.server.to(`jam:${result.session.id}`).emit('jam:queue-updated', {
      queue: result.session.queue,
    });
  }

  @SubscribeMessage('jam:update-settings')
  handleUpdateSettings(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { settings: Partial<import('./jam.types').JamSettings> },
  ): void {
    const userId = client.data.userId;
    const settings = this.jamService.update_settings(userId, data.settings);
    if (!settings) {
      client.emit('jam:control-denied', { action: 'update-settings' });
      return;
    }

    const session = this.jamService.get_user_session(userId);
    if (!session) return;

    this.server.to(`jam:${session.id}`).emit('jam:settings-changed', {
      settings,
      sessionId: session.id,
    });
  }

  @SubscribeMessage('jam:join-room')
  handleJoinRoom(@ConnectedSocket() client: Socket): void {
    const userId = client.data.userId;
    const session = this.jamService.get_user_session(userId);
    if (session) {
      client.join(`jam:${session.id}`);
      client.emit('jam:state', this.jamService.to_state(session));
    }
  }

  broadcast_to_jam(sessionId: string, event: string, data: any): void {
    this.server.to(`jam:${sessionId}`).emit(event, data);
  }
}
