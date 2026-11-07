import { Module } from '@nestjs/common';
import { GamesSyncController } from 'src/controllers/sync/games-sync.controller';
import { GamesSyncService } from 'src/services/sync/games-sync.service';
import { supabaseProvider } from 'src/config/supabase.provider';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';

@Module({
  controllers: [GamesSyncController],
  providers: [GamesSyncService, supabaseProvider],
  imports: [RealtimeModule],
})
export class GamesSyncModule {}
