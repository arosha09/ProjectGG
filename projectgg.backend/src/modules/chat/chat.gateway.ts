import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DiscordBotService } from './discord-bot.service';

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly discordBot: DiscordBotService,
  ) {}

  onModuleInit(): void {
    this.discordBot.setMessageCallback((msg) => {
      this.broadcastMessage(msg);
    });
  }

  handleConnection(client: Socket): void {}
  handleDisconnect(): void {}

  broadcastMessage(msg: any): void {
    this.server?.emit('message', msg);
  }

  broadcastServerEvent(event: string, data: any): void {
    this.server?.emit(event, data);
  }
}
