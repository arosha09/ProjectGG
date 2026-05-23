import { Injectable } from '@nestjs/common';
import { XpRepository } from '../repositories/xp.repository';

@Injectable()
export class XpService {
  constructor(private readonly xpRepository: XpRepository) {}

  async getUserRank(userId: string) {
    return this.xpRepository.getUserRank(userId);
  }

  async awardDailyLogin(userId: string) {
    return this.xpRepository.awardDailyLogin(userId);
  }

  async canClaimDaily(userId: string) {
    return this.xpRepository.canClaimDaily(userId);
  }

  async awardCustomXp(userId: string, xp: number, source: string, sourceId?: string) {
    return this.xpRepository.awardCustomXp(userId, xp, source, sourceId);
  }

  async getLeaderboard(limit: number) {
    return this.xpRepository.getLeaderboard(limit);
  }
}
