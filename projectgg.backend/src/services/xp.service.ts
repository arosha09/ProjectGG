import { Injectable } from '@nestjs/common';
import { XpRepository } from '../repositories/xp.repository';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';

@Injectable()
export class XpService {
  constructor(
    private readonly xpRepository: XpRepository,
    private readonly realtime: RealtimeGateway,
  ) {}

  async getUserRank(userId: string) {
    return this.xpRepository.getUserRank(userId);
  }

  async awardDailyLogin(userId: string) {
    const result = await this.xpRepository.awardDailyLogin(userId);
    if (result?.xp_awarded) {
      this.realtime.emitToUser(userId, 'xp:changed', {
        amount: result.xp_awarded,
        source: 'daily_login',
      });
    }
    return result;
  }

  async canClaimDaily(userId: string) {
    return this.xpRepository.canClaimDaily(userId);
  }

  async awardCustomXp(
    userId: string,
    xp: number,
    source: string,
    sourceId?: string,
    characterId?: string,
  ) {
    const result = await this.xpRepository.awardCustomXp(
      userId,
      xp,
      source,
      sourceId,
    );
    // character-scoped XP recorded separately if needed (no-op for now)
    if (result) {
      this.realtime.emitToUser(userId, 'xp:changed', {
        amount: xp,
        source,
        sourceId,
      });
    }
    return result;
  }

  async getLeaderboard(limit: number) {
    return this.xpRepository.getLeaderboard(limit);
  }
}
