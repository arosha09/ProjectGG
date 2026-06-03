import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceGateway } from './voice.gateway';
import { VoiceController } from './voice.controller';
import { UsersModule } from '../users.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [UsersModule, ChatModule],
  providers: [VoiceService, VoiceGateway],
  controllers: [VoiceController],
  exports: [VoiceService],
})
export class VoiceModule {}
