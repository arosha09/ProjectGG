import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { DiscordBotService } from './discord-bot.service';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  imports: [
    MulterModule.register({ dest: './uploads' }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, DiscordBotService, supabaseProvider],
  exports: [ChatService],
})
export class ChatModule {}
