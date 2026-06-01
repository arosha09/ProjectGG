import { Injectable, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { CardCollectionRepository } from './card-collection.repository';
import { XpService } from '../../services/xp.service';
import { TasksService } from '../tasks/tasks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const XP_MAP: Record<string, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 250,
};

const TASK_THRESHOLDS: Record<string, number> = {
  send_messages: 10,
  voice_minutes: 30,
  reactions: 5,
};

@Injectable()
export class CardCollectionService {
  constructor(
    private readonly repo: CardCollectionRepository,
    private readonly xpService: XpService,
    @Inject(forwardRef(() => TasksService)) private readonly tasksService: TasksService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async getDailyDrawCards(userId: string) {
    return this.repo.getDailyDrawCards(userId);
  }

  async claimDailyDraw(userId: string) {
    const result = await this.repo.claimDailyDraw(userId);
    if (!result) throw new BadRequestException('Draw failed');
    if (result.xp_awarded > 0) {
      try {
        await this.xpService.awardCustomXp(userId, result.xp_awarded, 'card_draw', result.game_code);
      } catch { /* non-critical */ }
    }
    try {
      await this.tasksService.bumpAchievementProgress(userId, 'cards_collected');
    } catch { /* non-critical */ }
    this.realtime.emitToUser(userId, 'cards:updated', { type: 'daily_draw', card: result });
    return result;
  }

  async drawWithTicket(userId: string, ticketId: number) {
    const result = await this.repo.drawWithTicket(userId, ticketId);
    if (!result) throw new BadRequestException('Draw failed');
    if (result.xp_awarded > 0) {
      try {
        await this.xpService.awardCustomXp(userId, result.xp_awarded, 'card_draw_ticket', result.game_code);
      } catch { /* non-critical */ }
    }
    try {
      await this.tasksService.bumpAchievementProgress(userId, 'cards_collected');
    } catch { /* non-critical */ }
    this.realtime.emitToUser(userId, 'cards:updated', { type: 'ticket_draw', card: result });
    return result;
  }

  async getCollection(userId: string, page: number, pageSize: number, tier?: string, search?: string) {
    return this.repo.getUserCollection(userId, page, pageSize, tier, search);
  }

  async toggleFavorite(userId: string, gameCode: string) {
    const result = await this.repo.toggleFavorite(userId, gameCode);
    try {
      await this.tasksService.bumpAchievementProgress(userId, 'cards_favorited');
    } catch { /* non-critical */ }
    return result;
  }

  async getShowcase(userId: string) {
    return this.repo.getUserShowcase(userId);
  }

  async createTrade(
    proposerId: string,
    proposerCardId: number,
    receiverId: string,
    receiverCardId: number,
    allowUnfair = false,
  ) {
    if (proposerId === receiverId) throw new BadRequestException('Cannot trade with yourself');

    const fairness = await this.checkTradeFairness(proposerCardId, receiverCardId);
    if (!fairness.isFair && !allowUnfair) {
      throw new BadRequestException({
        message: 'Trade is not tier-balanced',
        ...fairness,
      });
    }

    return this.repo.createTrade(proposerId, proposerCardId, receiverId, receiverCardId, allowUnfair);
  }

  async acceptTrade(tradeId: number, userId: string) {
    const trades = await this.repo.getUserTrades(userId);
    const trade = trades.find((t: any) => t.trade_id === tradeId);
    if (!trade) throw new ForbiddenException('Trade not found');
    if (trade.receiver_id !== userId) throw new ForbiddenException('Not your trade');

    await this.repo.acceptTrade(tradeId, userId);

    // Award 50% XP to receiver for the card they got
    const receiverTier = trade.proposer_tier;
    const xp = Math.floor((XP_MAP[receiverTier] || 10) / 2);
    try {
      await this.xpService.awardCustomXp(userId, xp, 'card_trade', String(tradeId));
    } catch { /* non-critical */ }

    return { success: true };
  }

  async rejectTrade(tradeId: number, userId: string) {
    await this.repo.rejectTrade(tradeId, userId);
    return { success: true };
  }

  async cancelTrade(tradeId: number, userId: string) {
    await this.repo.cancelTrade(tradeId, userId);
    return { success: true };
  }

  async getTrades(userId: string, otherUserId?: string) {
    return this.repo.getUserTrades(userId, otherUserId);
  }

  async checkTradeFairness(proposerCardId: number, receiverCardId: number): Promise<{ isFair: boolean; tierDiff: number; proposerTier: string; receiverTier: string }> {
    const proposerTier = await this.repo.getCardTier(proposerCardId);
    const receiverTier = await this.repo.getCardTier(receiverCardId);
    const TIER_VALUES: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
    const pVal = TIER_VALUES[proposerTier] ?? 1;
    const rVal = TIER_VALUES[receiverTier] ?? 1;
    const diff = pVal - rVal;
    return {
      isFair: diff === 0,
      tierDiff: Math.abs(diff),
      proposerTier,
      receiverTier,
    };
  }

  async giftCard(gifterId: string, gifterCardId: number, receiverId: string) {
    if (gifterId === receiverId) throw new BadRequestException('Cannot gift to yourself');
    const card = await this.repo.getCardById(gifterCardId);
    if (!card) throw new BadRequestException('Card not found');
    if (card.user_id !== gifterId) throw new ForbiddenException('Card does not belong to you');
    return this.repo.giftCard(gifterId, gifterCardId, receiverId);
  }

  async getStats(userId: string) {
    return this.repo.getCollectionStats(userId);
  }

  async awardTicket(userId: string, source: string) {
    return this.repo.awardDrawTicket(userId, source);
  }

  async getTickets(userId: string) {
    return this.repo.getDrawTickets(userId);
  }

  async trackTask(userId: string, taskType: string) {
    const count = await this.repo.incrementTaskProgress(userId, taskType);
    const threshold = TASK_THRESHOLDS[taskType];
    if (threshold && count >= threshold) {
      await this.repo.awardDrawTicket(userId, `task_${taskType}`);
      return { count, awarded: true, threshold };
    }
    return { count, awarded: false, threshold: threshold || 0 };
  }

  async getTaskProgress(userId: string) {
    return this.repo.getTaskProgress(userId);
  }

  async addReaction(messageId: number, messageSource: string, userId: string, emoji: string) {
    return this.repo.addReaction(messageId, messageSource, userId, emoji);
  }

  async removeReaction(messageId: number, messageSource: string, userId: string, emoji: string) {
    return this.repo.removeReaction(messageId, messageSource, userId, emoji);
  }

  async getMessageReactions(messageIds: number[], messageSource: string) {
    return this.repo.getMessageReactions(messageIds, messageSource);
  }

  async getLeaderboard(limit: number) {
    return this.repo.getCardLeaderboard(limit);
  }
}
