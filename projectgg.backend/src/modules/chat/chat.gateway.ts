import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DiscordBotService } from './discord-bot.service';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { TasksService } from '../tasks/tasks.service';

type UserStatus = 'online' | 'away' | 'dnd' | 'invisible';

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private usersChannel: any = null;
  private heartbeatSweep: ReturnType<typeof setInterval> | null = null;
  private taskProgressTick: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatByUser = new Map<string, number>();
  private readonly connectedSockets = new Map<string, Set<string>>();

  private readonly HEARTBEAT_TIMEOUT_MS = 45_000;
  private readonly TASK_TICK_INTERVAL_MS = 10_000;
  private readonly TASK_TICK_SECONDS = 10;

  constructor(
    private readonly discordBot: DiscordBotService,
    @Inject(forwardRef(() => TasksService)) private readonly tasksService: TasksService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  onModuleInit(): void {
    this.discordBot.setMessageCallback((msg) => {
      this.broadcastMessage(msg);
    });

    this.subscribeToUserStatusChanges();
    this.heartbeatSweep = setInterval(() => this.pruneStaleHeartbeats(), 10_000);
    this.taskProgressTick = setInterval(() => this.tickTaskProgress(), this.TASK_TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.usersChannel) {
      this.supabase.removeChannel(this.usersChannel);
      this.usersChannel = null;
    }
    if (this.heartbeatSweep) {
      clearInterval(this.heartbeatSweep);
      this.heartbeatSweep = null;
    }
    if (this.taskProgressTick) {
      clearInterval(this.taskProgressTick);
      this.taskProgressTick = null;
    }
  }

  handleConnection(client: Socket): void {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      client.data.userId = userId;
      client.join(`user:${userId}`);
      const sockets = this.connectedSockets.get(userId) ?? new Set<string>();
      sockets.add(client.id);
      this.connectedSockets.set(userId, sockets);
      this.heartbeatByUser.set(userId, Date.now());
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client.data.userId ?? client.handshake.query.userId) as string;
    if (userId) {
      client.leave(`user:${userId}`);
      const sockets = this.connectedSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.connectedSockets.delete(userId);
          this.heartbeatByUser.delete(userId);
          void this.setDisconnectedPresence(userId);
        } else {
          this.connectedSockets.set(userId, sockets);
        }
      }
    }
  }

  @SubscribeMessage('status-change')
  async handleStatusChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { status?: string },
  ): Promise<void> {
    const userId = (client.data.userId ?? client.handshake.query.userId) as string;
    const status = this.normalizeStatus(payload?.status);
    if (!userId || !status) return;
    await this.persistStatus(userId, status);
    this.heartbeatByUser.set(userId, Date.now());
    this.broadcastUserStatus(userId, status, status);
  }

  @SubscribeMessage('heartbeat')
  handleHeartbeat(@ConnectedSocket() client: Socket): void {
    const userId = (client.data.userId ?? client.handshake.query.userId) as string;
    if (!userId) return;
    this.heartbeatByUser.set(userId, Date.now());
  }

  broadcastMessage(msg: any): void {
    this.server?.emit('message', msg);
  }

  broadcastServerEvent(event: string, data: any): void {
    this.server?.emit(event, data);
  }

  sendToUser(userId: string, event: string, data: any): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  async createNotification(userId: string, type: string, title: string, body?: string, data?: any): Promise<void> {
    try {
      const { error } = await this.supabase
        .schema('projectgg')
        .from('notifications')
        .insert({ user_id: userId, type, title, body: body ?? '', data: data ?? null });
      if (!error) {
        this.sendToUser(userId, 'notification', {});
      }
    } catch {}
  }

  private subscribeToUserStatusChanges(): void {
    this.usersChannel = this.supabase
      .channel('projectgg-users-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'projectgg', table: 'users' }, (payload: any) => {
        const userId = payload?.new?.id;
        if (!userId) return;

        const status = this.normalizeStatus(payload?.new?.status);
        const sysStatus = this.normalizeStatus(payload?.new?.sys_status);
        if (!status && !sysStatus) return;

        this.broadcastUserStatus(
          String(userId),
          status ?? this.resolveVisibleStatus(sysStatus ?? 'invisible', this.connectedSockets.has(String(userId))),
          sysStatus ?? status ?? 'invisible',
        );
      })
      .subscribe();
  }

  private async persistStatus(userId: string, status: UserStatus): Promise<void> {
    const visibleStatus = status;
    const preferredStatus = status;
    const { error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update({ status: visibleStatus, sys_status: preferredStatus })
      .eq('id', userId);
    if (error) {
      throw error;
    }
  }

  private async setDisconnectedPresence(userId: string): Promise<void> {
    // Re-verify that user has no active sockets before setting offline
    if (this.connectedSockets.has(userId) && (this.connectedSockets.get(userId)?.size ?? 0) > 0) {
      return;
    }

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('status, sys_status')
      .eq('id', userId)
      .single();
    if (error || !data) return;

    // Check again, in case a new connection was made during the DB fetch
    if (this.connectedSockets.has(userId) && (this.connectedSockets.get(userId)?.size ?? 0) > 0) {
      return;
    }

    const preferred = this.normalizeStatus(data.sys_status)
      ?? this.normalizeStatus(data.status)
      ?? 'invisible';
    const visibleStatus = this.resolveVisibleStatus(preferred, false);
    
    // Only update 'status', keep 'sys_status' as it represents the user's preferred status
    const { error: updateError } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update({ status: visibleStatus })
      .eq('id', userId);
    
    if (!updateError) {
      this.broadcastUserStatus(userId, visibleStatus, preferred);
    }
  }

  private pruneStaleHeartbeats(): void {
    const now = Date.now();
    for (const [userId, lastBeat] of this.heartbeatByUser.entries()) {
      if (now - lastBeat > this.HEARTBEAT_TIMEOUT_MS && !this.connectedSockets.has(userId)) {
        this.heartbeatByUser.delete(userId);
        void this.setDisconnectedPresence(userId);
      }
    }
  }

  private broadcastUserStatus(userId: string, status: UserStatus, sysStatus: UserStatus): void {
    this.server?.emit('user-status', {
      userId,
      status,
      sys_status: sysStatus,
    });
    this.sendToUser(userId, 'user-status', {
      userId,
      status,
      sys_status: sysStatus,
    });
  }

  private resolveVisibleStatus(status: UserStatus, connected: boolean): UserStatus {
    if (connected) return status;
    return status === 'away' ? 'away' : 'invisible';
  }

  private normalizeStatus(value: any): UserStatus | null {
    if (value === 'online' || value === 'away' || value === 'dnd' || value === 'invisible') return value;
    return null;
  }

  /**
   * Emit a task-update event to a specific user. Called by TasksService
   * whenever a task's progress or state changes (heartbeat accumulation,
   * auto-claim, achievement progress bump from a card draw, etc.).
   */
  emitTaskUpdate(userId: string, data: any): void {
    this.sendToUser(userId, 'task-update', data);
  }

  /**
   * Emit a task-completed event to a specific user. Same shape as
   * broadcastServerEvent('task-completed', ...) but per-user so we
   * don't spam every connected socket.
   */
  emitTaskCompleted(userId: string, data: any): void {
    this.sendToUser(userId, 'task-completed', data);
  }

  /**
   * Every TASK_TICK_INTERVAL_MS, accumulate TASK_TICK_SECONDS of progress
   * for each connected user's active duration tasks. When a task crosses
   * its threshold, TasksService auto-claims it and emits task-completed.
   *
   * The presence of a socket is the tracking signal — the user is
   * "online" and "active" if they have at least one connected socket.
   */
  private async tickTaskProgress(): Promise<void> {
    const userIds = Array.from(this.connectedSockets.keys());
    for (const userId of userIds) {
      // Re-verify the user is still connected (race with disconnect)
      if (!this.connectedSockets.has(userId) || (this.connectedSockets.get(userId)?.size ?? 0) === 0) {
        continue;
      }
      try {
        await this.tasksService.accumulateRealtimeProgress(userId, this.TASK_TICK_SECONDS);
      } catch {
        // non-critical, keep ticking for the other users
      }
    }
  }
}
