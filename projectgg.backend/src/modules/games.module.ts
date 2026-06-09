import { Module } from '@nestjs/common';
import { GamesController } from 'src/controllers/games.controller';
import { GamesService } from 'src/services/games.service';
import { GamesRepository } from 'src/repositories/games.repository';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [GamesController],
  providers: [GamesService, GamesRepository, supabaseProvider],
})
export class GamesModule {}
