import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly userSockets = new Map<string, Set<string>>();

  handleConnection(client: Socket): void {
    const userId = client.handshake.query.userId as string;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    client.join(`user:${userId}`);
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(client.id);
    this.userSockets.set(userId, sockets);
    this.logger.log(`Realtime client connected: ${userId} (${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    }
  }

  emitToUser(userId: string, event: string, data: any): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  emitToUsers(userIds: string[], event: string, data: any): void {
    for (const id of userIds) this.emitToUser(id, event, data);
  }

  broadcast(event: string, data: any): void {
    this.server?.emit(event, data);
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}
