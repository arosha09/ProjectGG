import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';

@Injectable()
export class CardCollectionRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  private inferTier(rating?: number | null): string {
    const value = typeof rating === 'number' ? rating : null;
    if (value === null) return 'common';
    if (value >= 90) return 'legendary';
    if (value >= 80) return 'epic';
    if (value >= 70) return 'rare';
    if (value >= 50) return 'uncommon';
    return 'common';
  }

  private mapDrawCard(row: any): any {
    return {
      game_code: row?.game_code ?? row?.code ?? '',
      game_name: row?.game_name ?? row?.name ?? '',
      cover_url: row?.cover_url ?? '',
      rating: row?.rating ?? null,
      card_tier: row?.card_tier ?? this.inferTier(row?.rating ?? null),
      series_name: row?.series_name ?? null,
      desc: row?.desc ?? row?.description ?? null,
      release_year: row?.release_year ?? null,
      source: row?.source ?? row?.external_source ?? null,
    };
  }

  async getDailyDrawCards(userId: string): Promise<any[]> {
    const rpcResult = await this.supabase.rpc('get_daily_draw_cards', {
      in_user_id: userId,
    });

    if (!rpcResult.error) {
      return (rpcResult.data || []).map((row: any) => this.mapDrawCard(row));
    }

    const message = String(rpcResult.error?.message ?? '').toLowerCase();
    const code = String(rpcResult.error?.code ?? '');
    const missingFn = message.includes('could not find the function') || code === 'PGRST202';
    if (!missingFn) {
      throw new InternalServerErrorException(`get_daily_draw_cards: ${rpcResult.error.message}`);
    }

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code,name,cover_url,rating,series_name,desc,release_year,external_source')
      .order('name', { ascending: true })
      .limit(40);
    if (error) throw new InternalServerErrorException(`get_daily_draw_cards fallback: ${error.message}`);

    const cards = (data ?? []).map((row: any) => this.mapDrawCard(row));
    return cards.sort(() => Math.random() - 0.5);
  }

  async claimDailyDraw(userId: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('claim_daily_draw', {
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`claim_daily_draw: ${error.message}`);
    return data?.[0] || null;
  }

  async drawWithTicket(userId: string, ticketId: number): Promise<any> {
    const { data, error } = await this.supabase.rpc('draw_with_ticket', {
      in_user_id: userId,
      in_ticket_id: ticketId,
    });
    if (error) throw new InternalServerErrorException(`draw_with_ticket: ${error.message}`);
    return data?.[0] || null;
  }

  async getUserCollection(userId: string, page: number, pageSize: number, tier?: string, search?: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_user_collection', {
      in_user_id: userId,
      in_page: page,
      in_page_size: pageSize,
      in_tier: tier || null,
      in_search: search || null,
    });
    if (error) throw new InternalServerErrorException(`get_user_collection: ${error.message}`);
    return data || [];
  }

  async toggleFavorite(userId: string, gameCode: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('toggle_card_favorite', {
      in_user_id: userId,
      in_game_code: gameCode,
    });
    if (error) throw new InternalServerErrorException(`toggle_card_favorite: ${error.message}`);
    return data;
  }

  async getUserShowcase(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_user_showcase', {
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`get_user_showcase: ${error.message}`);
    return data || [];
  }

  async createTrade(proposerId: string, proposerCardId: number, receiverId: string, receiverCardId: number): Promise<number> {
    const { data, error } = await this.supabase.rpc('create_trade', {
      in_proposer_id: proposerId,
      in_proposer_card_id: proposerCardId,
      in_receiver_id: receiverId,
      in_receiver_card_id: receiverCardId,
    });
    if (error) throw new InternalServerErrorException(`create_trade: ${error.message}`);
    return data;
  }

  async acceptTrade(tradeId: number, userId: string): Promise<void> {
    const { error } = await this.supabase.rpc('accept_trade', {
      in_trade_id: tradeId,
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`accept_trade: ${error.message}`);
  }

  async rejectTrade(tradeId: number, userId: string): Promise<void> {
    const { error } = await this.supabase.rpc('reject_trade', {
      in_trade_id: tradeId,
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`reject_trade: ${error.message}`);
  }

  async cancelTrade(tradeId: number, userId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('proposer_id', userId)
      .eq('status', 'pending');
    if (error) throw new InternalServerErrorException(`cancelTrade: ${error.message}`);
  }

  async getUserTrades(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_user_trades', {
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`get_user_trades: ${error.message}`);
    return data || [];
  }

  async getCollectionStats(userId: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('get_collection_stats', {
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`get_collection_stats: ${error.message}`);
    return data?.[0] || null;
  }

  async awardDrawTicket(userId: string, source: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('award_draw_ticket', {
      in_user_id: userId,
      in_source: source,
    });
    if (error) throw new InternalServerErrorException(`award_draw_ticket: ${error.message}`);
    return data;
  }

  async getDrawTickets(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_draw_tickets')
      .select('*')
      .eq('user_id', userId)
      .eq('used', false)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(`getDrawTickets: ${error.message}`);
    return data || [];
  }

  async incrementTaskProgress(userId: string, taskType: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('increment_task_progress', {
      in_user_id: userId,
      in_task_type: taskType,
    });
    if (error) throw new InternalServerErrorException(`increment_task_progress: ${error.message}`);
    return data;
  }

  async getTaskProgress(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_task_progress', {
      in_user_id: userId,
    });
    if (error) throw new InternalServerErrorException(`get_task_progress: ${error.message}`);
    return data || [];
  }

  async addReaction(messageId: number, messageSource: string, userId: string, emoji: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('add_reaction', {
      in_message_id: messageId,
      in_message_source: messageSource,
      in_user_id: userId,
      in_emoji: emoji,
    });
    if (error) throw new InternalServerErrorException(`add_reaction: ${error.message}`);
    return data;
  }

  async removeReaction(messageId: number, messageSource: string, userId: string, emoji: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('remove_reaction', {
      in_message_id: messageId,
      in_message_source: messageSource,
      in_user_id: userId,
      in_emoji: emoji,
    });
    if (error) throw new InternalServerErrorException(`remove_reaction: ${error.message}`);
    return data;
  }

  async getMessageReactions(messageIds: number[], messageSource: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_message_reactions', {
      in_message_ids: messageIds,
      in_message_source: messageSource,
    });
    if (error) throw new InternalServerErrorException(`get_message_reactions: ${error.message}`);
    return data || [];
  }

  async getCardLeaderboard(limit: number): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_card_leaderboard', {
      in_limit: limit,
    });
    if (error) throw new InternalServerErrorException(`get_card_leaderboard: ${error.message}`);
    return data || [];
  }
}
