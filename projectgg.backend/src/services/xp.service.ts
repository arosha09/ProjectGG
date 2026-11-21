import { BadRequestException, Injectable } from '@nestjs/common';
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

  async awardCharacterEvents(userId: string, body: any) {
    const events = body?.events;
    if (!Array.isArray(events) || !events.length || events.length > 100) {
      throw new BadRequestException('Provide 1-100 character XP events');
    }
    const ids = new Set<string>();
    const normalized = events.map(event => {
      if (!event || !/^[a-f0-9]{32}$/.test(event.event_id ?? '') ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.character_id ?? '') ||
          !Number.isSafeInteger(event.xp) || event.xp <= 0 || event.xp > 100000 || ids.has(event.event_id)) {
        throw new BadRequestException('Invalid or repeated character XP event');
      }
      ids.add(event.event_id);
      return { event_id: event.event_id, character_id: event.character_id, xp: event.xp };
    });
    const result = await this.xpRepository.awardCharacterEvents(userId, normalized);
    if (result.awarded_xp > 0) this.realtime.emitToUser(userId, 'xp:changed', {
      amount: result.awarded_xp, source: 'project-free-will',
    });
    return result;
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

  async addXp(userId: string, xp: number, source: string, sourceId?: string) {
    const result = await this.xpRepository.addXp(userId, xp, source, sourceId);
    if (result?.new_total_xp) {
      this.realtime.emitToUser(userId, 'xp:changed', {
        amount: xp,
        source,
        sourceId,
      });
    }
    return result;
  }

  async awardFirstGameBonus(userId: string) {
    return this.xpRepository.awardFirstGameBonus(userId);
  }
}
