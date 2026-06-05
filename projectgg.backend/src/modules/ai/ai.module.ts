import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { VoiceTrainingService } from './voice-training.service';
import { AiController } from './ai.controller';
import { ChatModule } from '../chat/chat.module';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [AiController],
  providers: [AiService, VoiceTrainingService, supabaseProvider],
  exports: [AiService, VoiceTrainingService],
})
export class AiModule {}
