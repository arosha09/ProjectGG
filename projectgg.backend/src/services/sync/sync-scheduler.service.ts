import {
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { GamesSyncService } from './games-sync.service';

@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);

  constructor(
    private readonly syncService: GamesSyncService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Auto-sync all queued games every hour.
   * Only runs if AUTO_SYNC_ENABLED=true env var is set.
   * Skips if a sync is already in progress.
   */
  @Cron('0 */1 * * * *') // every hour
  async autoSyncAll() {
    const enabled = this.config.get<string>('AUTO_SYNC_ENABLED') === 'true';
    if (!enabled) return;

    try {
      const result = await this.syncService.syncAll();
      this.logger.log(
        `Auto-sync started: ${result.total} games queued`,
      );
    } catch (e: any) {
      this.logger.error(`Auto-sync failed: ${e.message}`);
    }
  }
}
