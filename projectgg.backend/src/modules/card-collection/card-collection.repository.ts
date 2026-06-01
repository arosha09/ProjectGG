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
      card_tier: row?.card_tier ?? row?.tier ?? this.inferTier(row?.rating ?? null),
      series_name: row?.series_name ?? null,
      desc: row?.desc ?? row?.description ?? null,
      release_year: row?.release_year ?? null,
      source: row?.source ?? null,
    };
  }

  async getDailyDrawCards(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code,name,cover_url,rating,series_name,desc,tier')
      .limit(40);
    if (error) throw new InternalServerErrorException(`getDailyDrawCards: ${error.message}`);

    const cards = (data ?? []).map((row: any) => this.mapDrawCard(row));
    return cards.sort(() => Math.random() - 0.5);
  }

  async claimDailyDraw(userId: string): Promise<any> {
    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('id,code,name,cover_url,rating,series_name,desc,tier');
    if (gamesErr) throw new InternalServerErrorException(`claimDailyDraw games: ${gamesErr.message}`);
    if (!games || games.length === 0) throw new InternalServerErrorException('No games available for draw');

    const game = games[Math.floor(Math.random() * games.length)];
    const tier = game.tier || this.inferTier(game.rating);

    const { data: existing } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id')
      .eq('user_id', userId)
      .eq('game_code', game.code)
      .limit(1);

    const isNew = !existing || existing.length === 0;
    const xpMap: Record<string, number> = { legendary: 250, epic: 100, rare: 50, uncommon: 25, common: 10 };
    const xp = isNew ? (xpMap[tier] || 10) : 10;

    const { error: insertErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .insert({
        user_id: userId,
        game_code: game.code,
        tier,
        xp_earned: xp,
        is_favorite: false,
        drawn_at: new Date().toISOString(),
      });
    if (insertErr) throw new InternalServerErrorException(`claimDailyDraw insert: ${insertErr.message}`);

    return {
      game_code: game.code,
      game_name: game.name,
      cover_url: game.cover_url,
      rating: game.rating,
      card_tier: tier,
      series_name: game.series_name,
      desc: game.desc,
      release_year: null,
      source: null,
      is_new: isNew,
      xp_awarded: xp,
    };
  }

  async drawWithTicket(userId: string, ticketId: number): Promise<any> {
    const { data: ticket, error: ticketErr } = await this.supabase
      .schema('projectgg')
      .from('card_draw_tickets')
      .select('id')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .eq('used', false)
      .single();
    if (ticketErr || !ticket) throw new InternalServerErrorException('Invalid or already used ticket');

    const { error: usedErr } = await this.supabase
      .schema('projectgg')
      .from('card_draw_tickets')
      .update({ used: true })
      .eq('id', ticketId);
    if (usedErr) throw new InternalServerErrorException(`drawWithTicket mark used: ${usedErr.message}`);

    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('id,code,name,cover_url,rating,series_name,desc,tier');
    if (gamesErr) throw new InternalServerErrorException(`drawWithTicket games: ${gamesErr.message}`);
    if (!games || games.length === 0) throw new InternalServerErrorException('No games available for draw');

    const game = games[Math.floor(Math.random() * games.length)];
    const tier = game.tier || this.inferTier(game.rating);

    const { data: existing } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id')
      .eq('user_id', userId)
      .eq('game_code', game.code)
      .limit(1);

    const isNew = !existing || existing.length === 0;
    const xpMap: Record<string, number> = { legendary: 250, epic: 100, rare: 50, uncommon: 25, common: 10 };
    const xp = isNew ? (xpMap[tier] || 10) : 10;

    const { error: insertErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .insert({
        user_id: userId,
        game_code: game.code,
        tier,
        xp_earned: xp,
        is_favorite: false,
        drawn_at: new Date().toISOString(),
      });
    if (insertErr) throw new InternalServerErrorException(`drawWithTicket insert: ${insertErr.message}`);

    return {
      game_code: game.code,
      game_name: game.name,
      cover_url: game.cover_url,
      rating: game.rating,
      card_tier: tier,
      series_name: game.series_name,
      desc: game.desc,
      release_year: null,
      source: null,
      is_new: isNew,
      xp_awarded: xp,
    };
  }

  async getUserCollection(userId: string, page: number, pageSize: number, tier?: string, search?: string): Promise<any[]> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code, tier, xp_earned, is_favorite, drawn_at')
      .eq('user_id', userId)
      .order('drawn_at', { ascending: false })
      .range(from, to);

    if (tier) {
      query = query.eq('tier', tier);
    }
    if (search) {
      query = query.ilike('game_code', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(`getUserCollection: ${error.message}`);

    if (!data || data.length === 0) return [];

    // Join with games_master for cover, name, etc.
    const gameCodes = [...new Set(data.map((r: any) => r.game_code).filter(Boolean))];
    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code, name, cover_url, rating, desc, genres, platforms, series_name, release_year')
      .in('code', gameCodes);
    if (gamesErr) throw new InternalServerErrorException(`getUserCollection games: ${gamesErr.message}`);
    const gameMap = new Map<string, any>((games || []).map((g: any) => [g.code, g]));

    return data.map((row: any) => {
      const game = gameMap.get(row.game_code) ?? {};
      return {
        id: row.id,
        user_id: row.user_id,
        game_code: row.game_code,
        tier: row.tier,
        card_tier: row.tier,
        xp_earned: row.xp_earned,
        is_favorite: row.is_favorite,
        drawn_at: row.drawn_at,
        game_name: (game as any).name ?? null,
        name: (game as any).name ?? null,
        cover_url: (game as any).cover_url ?? null,
        rating: (game as any).rating ?? null,
        desc: (game as any).desc ?? null,
        genres: (game as any).genres ?? [],
        platforms: (game as any).platforms ?? [],
        series_name: (game as any).series_name ?? null,
      };
    });
  }

  async toggleFavorite(userId: string, gameCode: string): Promise<boolean> {
    // Look up existing favorite state
    const { data: existing, error: lookupErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, is_favorite')
      .eq('user_id', userId)
      .eq('game_code', gameCode)
      .limit(1)
      .maybeSingle();
    if (lookupErr) throw new InternalServerErrorException(`toggleFavorite lookup: ${lookupErr.message}`);

    const newValue = !(existing?.is_favorite ?? false);
    const { error: updateErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .update({ is_favorite: newValue })
      .eq('user_id', userId)
      .eq('game_code', gameCode);
    if (updateErr) throw new InternalServerErrorException(`toggleFavorite update: ${updateErr.message}`);
    return newValue;
  }

  async getUserShowcase(userId: string): Promise<any[]> {
    // Get user's favorites (showcase = favorite cards)
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code, tier, xp_earned, is_favorite, drawn_at')
      .eq('user_id', userId)
      .eq('is_favorite', true)
      .order('drawn_at', { ascending: false })
      .limit(12);
    if (error) throw new InternalServerErrorException(`getUserShowcase: ${error.message}`);

    if (!data || data.length === 0) return [];

    const gameCodes = [...new Set(data.map((r: any) => r.game_code).filter(Boolean))];
    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code, name, cover_url, rating, desc, genres, platforms, series_name, release_year')
      .in('code', gameCodes);
    if (gamesErr) throw new InternalServerErrorException(`getUserShowcase games: ${gamesErr.message}`);
    const gameMap = new Map<string, any>((games || []).map((g: any) => [g.code, g]));

    return data.map((row: any) => {
      const game = gameMap.get(row.game_code) ?? {};
      return {
        id: row.id,
        user_id: row.user_id,
        game_code: row.game_code,
        tier: row.tier,
        card_tier: row.tier,
        xp_earned: row.xp_earned,
        is_favorite: row.is_favorite,
        drawn_at: row.drawn_at,
        game_name: (game as any).name ?? null,
        name: (game as any).name ?? null,
        cover_url: (game as any).cover_url ?? null,
        rating: (game as any).rating ?? null,
        desc: (game as any).desc ?? null,
        genres: (game as any).genres ?? [],
        platforms: (game as any).platforms ?? [],
        series_name: (game as any).series_name ?? null,
      };
    });
  }

  async createTrade(proposerId: string, proposerCardId: number, receiverId: string, receiverCardId: number, allowUnfair?: boolean): Promise<number> {
    // Verify proposer owns the offered card
    const { data: proposerCard, error: proposerErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id')
      .eq('id', proposerCardId)
      .single();
    if (proposerErr || !proposerCard) throw new InternalServerErrorException('Proposer card not found');
    if (proposerCard.user_id !== proposerId) throw new InternalServerErrorException('You do not own this card');

    // Verify receiver owns the requested card
    const { data: receiverCard, error: receiverErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id')
      .eq('id', receiverCardId)
      .single();
    if (receiverErr || !receiverCard) throw new InternalServerErrorException('Receiver card not found');
    if (receiverCard.user_id !== receiverId) throw new InternalServerErrorException('Receiver does not own this card');

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .insert({
        proposer_id: proposerId,
        proposer_card: proposerCardId,
        receiver_id: receiverId,
        receiver_card: receiverCardId,
        status: 'pending',
        allow_unfair: allowUnfair ?? false,
      })
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException(`createTrade: ${error.message}`);
    return data?.id;
  }

  async getCardTier(cardId: number): Promise<string> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('tier')
      .eq('id', cardId)
      .single();
    if (error || !data) return 'common';
    return data.tier ?? 'common';
  }

  async getCardById(cardId: number): Promise<any> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('*, games_master(code, name, cover_url)')
      .eq('id', cardId)
      .single();
    if (error) throw new InternalServerErrorException(`getCardById: ${error.message}`);
    return data;
  }

  async giftCard(gifterId: string, gifterCardId: number, receiverId: string): Promise<number> {
    if (gifterId === receiverId) throw new InternalServerErrorException('Cannot gift to yourself');

    // Verify gifter owns the card
    const { data: card, error: cardErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id')
      .eq('id', gifterCardId)
      .single();
    if (cardErr || !card) throw new InternalServerErrorException('Card not found');
    if (card.user_id !== gifterId) throw new InternalServerErrorException('You do not own this card');

    // Transfer ownership
    const { error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .update({ user_id: receiverId })
      .eq('id', gifterCardId);
    if (error) throw new InternalServerErrorException(`giftCard: ${error.message}`);
    return gifterCardId;
  }

  async acceptTrade(tradeId: number, userId: string): Promise<void> {
    // Fetch trade
    const { data: trade, error: tradeErr } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .select('*')
      .eq('id', tradeId)
      .single();
    if (tradeErr || !trade) throw new InternalServerErrorException('Trade not found');
    if (trade.receiver_id !== userId) throw new InternalServerErrorException('Not authorized to accept this trade');
    if (trade.status !== 'pending') throw new InternalServerErrorException('Trade is no longer pending');

    // Swap ownership
    const { error: swapErr1 } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .update({ user_id: userId })
      .eq('id', trade.receiver_card);
    if (swapErr1) throw new InternalServerErrorException(`acceptTrade swap1: ${swapErr1.message}`);

    const { error: swapErr2 } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .update({ user_id: trade.proposer_id })
      .eq('id', trade.proposer_card);
    if (swapErr2) throw new InternalServerErrorException(`acceptTrade swap2: ${swapErr2.message}`);

    // Update trade status
    const { error: updateErr } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .update({ status: 'accepted', resolved_at: new Date().toISOString() })
      .eq('id', tradeId);
    if (updateErr) throw new InternalServerErrorException(`acceptTrade update: ${updateErr.message}`);
  }

  async rejectTrade(tradeId: number, userId: string): Promise<void> {
    const { data: trade, error: tradeErr } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .select('receiver_id, status')
      .eq('id', tradeId)
      .single();
    if (tradeErr || !trade) throw new InternalServerErrorException('Trade not found');
    if (trade.receiver_id !== userId) throw new InternalServerErrorException('Not authorized to reject this trade');
    if (trade.status !== 'pending') throw new InternalServerErrorException('Trade is no longer pending');

    const { error } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', tradeId);
    if (error) throw new InternalServerErrorException(`rejectTrade: ${error.message}`);
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
    // Fetch trades where user is proposer or receiver
    const { data: trades, error: tradesErr } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .select('*')
      .or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (tradesErr) throw new InternalServerErrorException(`getUserTrades: ${tradesErr.message}`);
    if (!trades || trades.length === 0) return [];

    // Collect user IDs and card IDs for joins
    const userIds = [...new Set(trades.flatMap(t => [t.proposer_id, t.receiver_id]))];
    const cardIds = [...new Set(trades.flatMap(t => [t.proposer_card, t.receiver_card]))];

    // Fetch users
    const { data: users, error: usersErr } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('id, username, avatar')
      .in('id', userIds);
    if (usersErr) throw new InternalServerErrorException(`getUserTrades users: ${usersErr.message}`);
    const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));

    // Fetch cards
    const { data: cards, error: cardsErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, game_code, tier')
      .in('id', cardIds);
    if (cardsErr) throw new InternalServerErrorException(`getUserTrades cards: ${cardsErr.message}`);
    const cardMap = new Map<number, any>((cards || []).map((c: any) => [c.id, c]));

    // Fetch game covers
    const gameCodes = [...new Set((cards || []).map((c: any) => c.game_code).filter(Boolean))];
    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code, cover_url')
      .in('code', gameCodes);
    if (gamesErr) throw new InternalServerErrorException(`getUserTrades games: ${gamesErr.message}`);
    const gameMap = new Map<string, any>((games || []).map((g: any) => [g.code, g]));

    // Assemble result
    return trades.map((t: any) => {
      const proposer = userMap.get(t.proposer_id);
      const receiver = userMap.get(t.receiver_id);
      const proposerCard = cardMap.get(t.proposer_card);
      const receiverCard = cardMap.get(t.receiver_card);
      const proposerGame = proposerCard ? gameMap.get((proposerCard as any).game_code) : null;
      const receiverGame = receiverCard ? gameMap.get((receiverCard as any).game_code) : null;

      return {
        trade_id: t.id,
        trade_status: t.status,
        proposer_id: t.proposer_id,
        proposer_name: (proposer as any)?.username ?? null,
        proposer_avatar: (proposer as any)?.avatar ?? null,
        proposer_tier: (proposerCard as any)?.tier ?? null,
        proposer_card_id: t.proposer_card,
        proposer_game_code: (proposerCard as any)?.game_code ?? null,
        proposer_cover: (proposerGame as any)?.cover_url ?? null,
        receiver_id: t.receiver_id,
        receiver_name: (receiver as any)?.username ?? null,
        receiver_avatar: (receiver as any)?.avatar ?? null,
        receiver_tier: (receiverCard as any)?.tier ?? null,
        receiver_card_id: t.receiver_card,
        receiver_game_code: (receiverCard as any)?.game_code ?? null,
        receiver_cover: (receiverGame as any)?.cover_url ?? null,
        allow_unfair: t.allow_unfair ?? false,
        created_at: t.created_at,
        resolved_at: t.resolved_at,
      };
    });
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
