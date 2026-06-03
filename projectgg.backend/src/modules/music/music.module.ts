import { Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { YouTubeMusicService } from './youtube-music.service';
import { YouTubeMusicController } from './youtube-music.controller';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [MusicController, YouTubeMusicController],
  providers: [MusicService, YouTubeMusicService, supabaseProvider],
  exports: [MusicService, YouTubeMusicService],
})
export class MusicModule {}
