import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';
import { VoiceGateway } from './voice.gateway';
import { VoiceController } from './voice.controller';
import { UsersModule } from '../users.module';
import { ChatModule } from '../chat/chat.module';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  imports: [
    MulterModule.register({ dest: './uploads' }),
    UsersModule,
    ChatModule,
  ],
  providers: [VoiceService, VoiceGateway, supabaseProvider],
  controllers: [VoiceController],
  exports: [VoiceService],
})
export class VoiceModule {}
