import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';

interface CallClient {
  userId: string;
}

interface CallSession {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  calleeId: string;
  calleeName: string;
  calleeAvatar: string | null;
  channelId: string | null; // null = DM call, otherwise = server voice channel invite
  guildId: string | null;
  startedAt: number;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*', credentials: true },
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CallGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> socket ids
  private activeCalls = new Map<string, CallSession>(); // callId -> session

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  handleConnection(client: Socket): void {
    const userId = client.handshake.query.userId as string;
    if (!userId) return;
    client.data.userId = userId;
    const set = this.userSockets.get(userId) ?? new Set();
    set.add(client.id);
    this.userSockets.set(userId, set);
    client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId;
    if (!userId) return;
    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) this.userSockets.delete(userId);
    }
    // If this user was in an active call, end it
    for (const [callId, session] of this.activeCalls.entries()) {
      if (session.callerId === userId || session.calleeId === userId) {
        this.activeCalls.delete(callId);
        const otherId = session.callerId === userId ? session.calleeId : session.callerId;
        this.server.to(`user:${otherId}`).emit('call-ended', { callId, reason: 'disconnected' });
      }
    }
  }

  private emitToUser(userId: string, event: string, data: any): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  @SubscribeMessage('call-initiate')
  async handleCallInitiate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { calleeId: string; channelId?: string; guildId?: string },
  ): Promise<{ ok: boolean; callId?: string; error?: string }> {
    const callerId = client.data.userId;
    if (!callerId || !payload?.calleeId) return { ok: false, error: 'invalid' };
    if (callerId === payload.calleeId) return { ok: false, error: 'cannot_call_self' };

    // If it's a channel invite, verify the caller is in that channel
    if (payload.channelId && payload.guildId) {
      const { data: member } = await this.supabase
        .schema('projectgg')
        .from('gg_server_members')
        .select('user_id')
        .eq('server_id', Number(payload.guildId))
        .eq('user_id', callerId)
        .single();
      if (!member) return { ok: false, error: 'not_in_server' };
    }

    // Fetch caller info
    const { data: caller } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('id, username, avatar, gender')
      .eq('id', callerId)
      .single();
    // Fetch callee info
    const { data: callee } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('id, username, avatar, gender')
      .eq('id', payload.calleeId)
      .single();
    if (!caller || !callee) return { ok: false, error: 'user_not_found' };

    // Check if callee is already in a call
    for (const session of this.activeCalls.values()) {
      if (session.calleeId === payload.calleeId || session.callerId === payload.calleeId) {
        return { ok: false, error: 'callee_busy' };
      }
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: CallSession = {
      callId,
      callerId,
      callerName: caller.username,
      callerAvatar: caller.avatar ?? null,
      calleeId: payload.calleeId,
      calleeName: callee.username,
      calleeAvatar: callee.avatar ?? null,
      channelId: payload.channelId ?? null,
      guildId: payload.guildId ?? null,
      startedAt: Date.now(),
    };
    this.activeCalls.set(callId, session);

    this.emitToUser(payload.calleeId, 'call-incoming', {
      callId,
      callerId,
      callerName: caller.username,
      callerAvatar: caller.avatar ?? null,
      channelId: payload.channelId ?? null,
      guildId: payload.guildId ?? null,
    });
    return { ok: true, callId };
  }

  @SubscribeMessage('call-accept')
  handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { callId: string },
  ): void {
    const userId = client.data.userId;
    const session = this.activeCalls.get(payload.callId);
    if (!session || session.calleeId !== userId) return;
    this.emitToUser(session.callerId, 'call-accepted', {
      callId: payload.callId,
      calleeId: userId,
      channelId: session.channelId,
      guildId: session.guildId,
    });
  }

  @SubscribeMessage('call-decline')
  handleCallDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { callId: string },
  ): void {
    const userId = client.data.userId;
    const session = this.activeCalls.get(payload.callId);
    if (!session || session.calleeId !== userId) return;
    this.activeCalls.delete(payload.callId);
    this.emitToUser(session.callerId, 'call-declined', { callId: payload.callId });
  }

  @SubscribeMessage('call-quick-reply')
  handleQuickReply(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { callId: string; message: string },
  ): void {
    const userId = client.data.userId;
    const session = this.activeCalls.get(payload.callId);
    if (!session || session.calleeId !== userId) return;
    this.emitToUser(session.callerId, 'call-quick-reply', {
      callId: payload.callId,
      message: payload.message,
    });
  }

  @SubscribeMessage('call-end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { callId: string },
  ): void {
    const userId = client.data.userId;
    const session = this.activeCalls.get(payload.callId);
    if (!session) return;
    if (session.callerId !== userId && session.calleeId !== userId) return;
    this.activeCalls.delete(payload.callId);
    const otherId = session.callerId === userId ? session.calleeId : session.callerId;
    this.emitToUser(otherId, 'call-ended', { callId: payload.callId, reason: 'ended' });
  }
}
