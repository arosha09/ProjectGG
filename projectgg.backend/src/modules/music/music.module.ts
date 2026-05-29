import { Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [MusicController],
  providers: [MusicService, supabaseProvider],
  exports: [MusicService],
})
export class MusicModule {}
