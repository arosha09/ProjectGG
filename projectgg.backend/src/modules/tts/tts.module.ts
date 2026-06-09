import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';
import { supabaseProvider } from '../../config/supabase.provider';
import { UsersModule } from '../users.module';

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [TtsController],
  providers: [TtsService, supabaseProvider],
  exports: [TtsService],
})
export class TtsModule {}
