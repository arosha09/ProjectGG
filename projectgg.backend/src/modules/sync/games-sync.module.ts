import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GamesSyncController } from 'src/controllers/sync/games-sync.controller';
import { GamesSyncService } from 'src/services/sync/games-sync.service';
import { SyncSchedulerService } from 'src/services/sync/sync-scheduler.service';
import { supabaseProvider } from 'src/config/supabase.provider';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';

@Module({
  controllers: [GamesSyncController],
  providers: [GamesSyncService, SyncSchedulerService, supabaseProvider],
  imports: [RealtimeModule, ScheduleModule.forRoot()],
})
export class GamesSyncModule {}
