import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { DiscordBotService } from './discord-bot.service';
import { supabaseProvider } from 'src/config/supabase.provider';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    MulterModule.register({ dest: './uploads' }),
    forwardRef(() => TasksModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, DiscordBotService, supabaseProvider],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
