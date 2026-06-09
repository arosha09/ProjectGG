import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';
import { CardCollectionRepository } from './card-collection.repository';
import { XpService } from '../../services/xp.service';
import { TasksService } from '../tasks/tasks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatGateway } from '../chat/chat.gateway';

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

const TIER_VALUES: Record<string, number> = {
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

@Injectable()
export class CardCollectionService {
  constructor(
    private readonly repo: CardCollectionRepository,
    private readonly xpService: XpService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  async getDailyDrawCards(userId: string) {
    return this.repo.getDailyDrawCards(userId);
  }

  async claimDailyDraw(userId: string) {
    const result = await this.repo.claimDailyDraw(userId);
    if (!result) throw new BadRequestException('Draw failed');
    if (result.xp_awarded > 0) {
      try {
        await this.xpService.awardCustomXp(
          userId,
          result.xp_awarded,
          'card_draw',
          result.game_code,
        );
      } catch {
        /* non-critical */
      }
    }
    try {
      await this.tasksService.bumpAchievementProgress(
        userId,
        'cards_collected',
      );
    } catch {
      /* non-critical */
    }
    this.realtime.emitToUser(userId, 'cards:updated', {
      type: 'daily_draw',
      card: result,
    });
    return result;
  }

  async drawWithTicket(userId: string, ticketId: number) {
    const result = await this.repo.drawWithTicket(userId, ticketId);
    if (!result) throw new BadRequestException('Draw failed');
    if (result.xp_awarded > 0) {
      try {
        await this.xpService.awardCustomXp(
          userId,
          result.xp_awarded,
          'card_draw_ticket',
          result.game_code,
        );
      } catch {
        /* non-critical */
      }
    }
    try {
      await this.tasksService.bumpAchievementProgress(
        userId,
        'cards_collected',
      );
    } catch {
      /* non-critical */
    }
    this.realtime.emitToUser(userId, 'cards:updated', {
      type: 'ticket_draw',
      card: result,
    });
    return result;
  }

  async getCollection(
    userId: string,
    page: number,
    pageSize: number,
    tier?: string,
    search?: string,
    sortBy?: string,
  ) {
    return this.repo.getUserCollection(
      userId,
      page,
      pageSize,
      tier,
      search,
      sortBy,
    );
  }

  async toggleFavorite(userId: string, gameCode: string) {
    const result = await this.repo.toggleFavorite(userId, gameCode);
    try {
      await this.tasksService.bumpAchievementProgress(
        userId,
        'cards_favorited',
      );
    } catch {
      /* non-critical */
    }
    this.chatGateway.sendToUser(userId, 'cards:updated', {
      type: 'favorite',
      gameCode,
      is_favorite: (result as any)?.is_favorite ?? result,
    });
    return result;
  }

  async getShowcase(userId: string, page = 1, pageSize = 50, sortBy?: string) {
    return this.repo.getUserShowcase(userId, page, pageSize, sortBy);
  }

  async createTrade(
    proposerId: string,
    proposerCardIds: number[],
    receiverId: string,
    receiverCardIds: number[],
    allowUnfair = false,
    message: string | null = null,
    parentTradeId: number | null = null,
  ) {
    if (proposerId === receiverId)
      throw new BadRequestException('Cannot trade with yourself');
    if (!proposerCardIds?.length)
      throw new BadRequestException('Must offer at least one card');
    if (!receiverCardIds?.length)
      throw new BadRequestException('Must request at least one card');

    // For counter offers, fairness is informational only (the original proposer already opted in)
    if (!parentTradeId) {
      const fairness = await this.checkTradeFairness(
        proposerCardIds,
        receiverCardIds,
      );
      if (!fairness.isFair && !allowUnfair) {
        throw new BadRequestException({
          message: 'Trade is not tier-balanced',
          ...fairness,
        });
      }
    }

    const tradeId = await this.repo.createTrade(
      proposerId,
      proposerCardIds,
      receiverId,
      receiverCardIds,
      allowUnfair,
      message,
      parentTradeId,
    );

    // Emit realtime event to receiver
    try {
      this.realtime.emitToUser(receiverId, 'trade:new', {
        tradeId,
        fromUserId: proposerId,
        parentTradeId,
      });
      this.realtime.emitToUser(proposerId, 'trade:new', {
        tradeId,
        fromUserId: proposerId,
        parentTradeId,
      });
    } catch {
      /* non-critical */
    }

    // Persist notification for the receiver
    try {
      const { data: proposer } = await this.supabase
        .schema('projectgg')
        .from('users')
        .select('username, avatar')
        .eq('id', proposerId)
        .single();
      const isCounter = !!parentTradeId;
      const title = isCounter ? 'Counter Trade Offer' : 'New Trade Offer';
      const body = isCounter
        ? `${proposer?.username ?? 'Someone'} sent you a counter offer.`
        : `${proposer?.username ?? 'Someone'} wants to trade cards with you.`;
      await this.supabase
        .schema('projectgg')
        .from('notifications')
        .insert({
          user_id: receiverId,
          type: isCounter ? 'trade_counter' : 'trade_offer',
          title,
          body,
          data: { tradeId, fromUserId: proposerId, parentTradeId },
        });
      this.realtime.emitToUser(receiverId, 'notification', {
        type: isCounter ? 'trade_counter' : 'trade_offer',
        title,
        body,
        data: { tradeId },
      });
    } catch {
      /* non-critical */
    }

    return { trade_id: tradeId };
  }

  async counterTrade(
    tradeId: number,
    userId: string,
    counterProposerCards: number[],
    counterReceiverCards: number[],
    message: string | null = null,
  ) {
    // Load original trade to identify the other side
    const originalTrades = await this.repo.getUserTrades(userId);
    const original = originalTrades.find((t) => t.trade_id === tradeId);
    if (!original) throw new ForbiddenException('Trade not found');
    if (!original.proposer_cards?.length || !original.receiver_cards?.length) {
      throw new BadRequestException('Original trade has no cards');
    }

    if (!counterProposerCards?.length || !counterReceiverCards?.length) {
      throw new BadRequestException('Counter must include cards on both sides');
    }

    // The original receiver (now counter-proposer) was `original.receiver_id`
    // The original proposer (now counter-receiver) was `original.proposer_id`
    // userId must be the original receiver
    if (userId !== original.receiver_id) {
      throw new ForbiddenException('Only the receiver can counter');
    }

    // Cancel the original trade
    await this.repo.cancelTrade(tradeId, userId);

    // Create the counter as a new trade linked via parent_trade_id
    return this.createTrade(
      userId,
      counterProposerCards,
      original.proposer_id,
      counterReceiverCards,
      true,
      message,
      tradeId,
    );
  }

  async acceptTrade(tradeId: number, userId: string) {
    const trades = await this.repo.getUserTrades(userId);
    const trade = trades.find((t: any) => t.trade_id === tradeId);
    if (!trade) throw new ForbiddenException('Trade not found');

    const isCounter = !!trade.parent_trade_id;
    const canAccept = isCounter
      ? trade.proposer_id === userId
      : trade.receiver_id === userId;
    if (!canAccept)
      throw new ForbiddenException('Not authorized to accept this trade');

    await this.repo.acceptTrade(tradeId, userId);

    const receivedCardIds = isCounter
      ? (trade.counter_proposer_cards || []).map((c: any) => c.card_id)
      : (trade.proposer_cards || []).map((c: any) => c.card_id);
    const tierMap = await this.repo.getCardTiers(receivedCardIds);
    let totalXp = 0;
    for (const id of receivedCardIds) {
      const tier = tierMap[id] || 'common';
      totalXp += Math.floor((XP_MAP[tier] || 10) / 2);
    }
    if (totalXp > 0) {
      try {
        await this.xpService.awardCustomXp(
          userId,
          totalXp,
          'card_trade',
          String(tradeId),
        );
      } catch {
        /* non-critical */
      }
    }

    try {
      const otherUserId = isCounter ? trade.proposer_id : trade.receiver_id;
      this.realtime.emitToUser(otherUserId, 'trade:accepted', { tradeId });
      this.chatGateway.sendToUser(otherUserId, 'trade:completed', {
        tradeId,
        status: 'accepted',
      });
      this.chatGateway.sendToUser(userId, 'trade:completed', {
        tradeId,
        status: 'accepted',
      });
      const { data: accepter } = await this.supabase
        .schema('projectgg')
        .from('users')
        .select('username')
        .eq('id', userId)
        .single();
      await this.supabase
        .schema('projectgg')
        .from('notifications')
        .insert({
          user_id: otherUserId,
          type: 'trade_accepted',
          title: 'Trade Accepted',
          body: `${accepter?.username ?? 'Someone'} accepted your trade.`,
          data: { tradeId },
        });
      this.realtime.emitToUser(otherUserId, 'notification', {
        type: 'trade_accepted',
        title: 'Trade Accepted',
        body: `${accepter?.username ?? 'Someone'} accepted your trade.`,
        data: { tradeId },
      });
    } catch {
      /* non-critical */
    }

    return { success: true };
  }

  async rejectTrade(tradeId: number, userId: string) {
    await this.repo.rejectTrade(tradeId, userId);

    try {
      const trades = await this.repo.getUserTrades(userId);
      const trade = trades.find((t: any) => t.trade_id === tradeId);
      if (trade) {
        const otherUserId =
          trade.receiver_id === userId ? trade.proposer_id : trade.receiver_id;
        this.realtime.emitToUser(otherUserId, 'trade:rejected', { tradeId });
        this.chatGateway.sendToUser(otherUserId, 'trade:completed', {
          tradeId,
          status: 'rejected',
        });
      }
    } catch {
      /* non-critical */
    }
    return { success: true };
  }

  async cancelTrade(tradeId: number, userId: string) {
    await this.repo.cancelTrade(tradeId, userId);

    try {
      const trades = await this.repo.getUserTrades(userId);
      const trade = trades.find((t: any) => t.trade_id === tradeId);
      if (trade) {
        const otherUserId =
          trade.receiver_id === userId ? trade.proposer_id : trade.receiver_id;
        this.realtime.emitToUser(otherUserId, 'trade:cancelled', { tradeId });
        this.chatGateway.sendToUser(otherUserId, 'trade:completed', {
          tradeId,
          status: 'cancelled',
        });
      }
    } catch {
      /* non-critical */
    }
    return { success: true };
  }

  async getTrades(userId: string, otherUserId?: string) {
    return this.repo.getUserTrades(userId, otherUserId);
  }

  async checkTradeFairness(
    proposerCardId: number | number[],
    receiverCardId: number | number[],
  ): Promise<{
    isFair: boolean;
    tierDiff: number;
    proposerTier: string;
    receiverTier: string;
  }> {
    const pIds = Array.isArray(proposerCardId)
      ? proposerCardId
      : [proposerCardId];
    const rIds = Array.isArray(receiverCardId)
      ? receiverCardId
      : [receiverCardId];
    const allIds = [...pIds, ...rIds];
    const tierMap = await this.repo.getCardTiers(allIds);
    const TIER_VALUES: Record<string, number> = {
      legendary: 5,
      epic: 4,
      rare: 3,
      uncommon: 2,
      common: 1,
    };
    const proposerValue = pIds.reduce(
      (sum, id) => sum + (TIER_VALUES[tierMap[id]] ?? 1),
      0,
    );
    const receiverValue = rIds.reduce(
      (sum, id) => sum + (TIER_VALUES[tierMap[id]] ?? 1),
      0,
    );
    const diff = proposerValue - receiverValue;
    return {
      isFair: diff === 0,
      tierDiff: Math.abs(diff),
      proposerTier: pIds.length ? (tierMap[pIds[0]] ?? 'common') : 'common',
      receiverTier: rIds.length ? (tierMap[rIds[0]] ?? 'common') : 'common',
    };
  }

  async giftCard(gifterId: string, gifterCardId: number, receiverId: string) {
    if (gifterId === receiverId)
      throw new BadRequestException('Cannot gift to yourself');
    const card = await this.repo.getCardById(gifterCardId);
    if (!card) throw new BadRequestException('Card not found');
    if (card.user_id !== gifterId)
      throw new ForbiddenException('Card does not belong to you');
    const result = await this.repo.giftCard(gifterId, gifterCardId, receiverId);
    this.chatGateway.sendToUser(gifterId, 'cards:updated', {
      type: 'gift_sent',
      gameCode: card.game_code,
    });
    this.chatGateway.sendToUser(receiverId, 'cards:updated', {
      type: 'gift_received',
      gameCode: card.game_code,
    });
    return result;
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
      this.chatGateway.sendToUser(userId, 'cards:updated', {
        type: 'ticket_awarded',
        source: taskType,
      });
      return { count, awarded: true, threshold };
    }
    return { count, awarded: false, threshold: threshold || 0 };
  }

  async getTaskProgress(userId: string) {
    return this.repo.getTaskProgress(userId);
  }

  async addReaction(
    messageId: number,
    messageSource: string,
    userId: string,
    emoji: string,
  ) {
    return this.repo.addReaction(messageId, messageSource, userId, emoji);
  }

  async removeReaction(
    messageId: number,
    messageSource: string,
    userId: string,
    emoji: string,
  ) {
    return this.repo.removeReaction(messageId, messageSource, userId, emoji);
  }

  async getMessageReactions(messageIds: number[], messageSource: string) {
    return this.repo.getMessageReactions(messageIds, messageSource);
  }

  async getLeaderboard(limit: number) {
    return this.repo.getCardLeaderboard(limit);
  }
}
