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

  private async incrementStaticTotal(userId: string, count = 1): Promise<void> {
    const { error } = await this.supabase.rpc('increment_static_total_cards', {
      in_user_id: userId,
      in_count: count,
    });
    if (error) {
      const { data } = await this.supabase
        .schema('projectgg')
        .from('users')
        .select('static_total_cards')
        .eq('id', userId)
        .single();
      await this.supabase
        .schema('projectgg')
        .from('users')
        .update({ static_total_cards: (data?.static_total_cards ?? 0) + count })
        .eq('id', userId);
    }
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
      release_year: row?.sequence_release ?? row?.release_year ?? null,
      source: row?.source ?? null,
    };
  }

  async getDailyDrawCards(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code,name,cover_url,rating,series_name,desc,tier,sequence_release')
      .limit(40);
    if (error) throw new InternalServerErrorException(`getDailyDrawCards: ${error.message}`);

    const cards = (data ?? []).map((row: any) => this.mapDrawCard(row));
    return cards.sort(() => Math.random() - 0.5);
  }

  async claimDailyDraw(userId: string): Promise<any> {
    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('id,code,name,cover_url,rating,series_name,desc,tier,sequence_release');
    if (gamesErr) throw new InternalServerErrorException(`claimDailyDraw games: ${gamesErr.message}`);
    if (!games || games.length === 0) throw new InternalServerErrorException('No games available for draw');

    // Fetch all games the user already owns
    const { data: owned } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('game_code')
      .eq('user_id', userId);
    const ownedCodes = new Set((owned ?? []).map((r: any) => r.game_code));

    // Pick a random unowned game (up to 50 attempts)
    let game: any = null;
    for (let i = 0; i < 50; i++) {
      const candidate = games[Math.floor(Math.random() * games.length)];
      if (!ownedCodes.has(candidate.code)) {
        game = candidate;
        break;
      }
    }

    // Fallback: if all games owned, pick any random game and grant reduced XP
    const isNew = !!game;
    if (!game) {
      game = games[Math.floor(Math.random() * games.length)];
    }

    const tier = game.tier || this.inferTier(game.rating);
    const xpMap: Record<string, number> = { legendary: 250, epic: 100, rare: 50, uncommon: 25, common: 10 };
    const xp = isNew ? (xpMap[tier] || 10) : 10;

    if (isNew) {
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
      await this.incrementStaticTotal(userId);
    }

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
      .select('id,code,name,cover_url,rating,series_name,desc,tier,sequence_release');
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
    if (isNew) await this.incrementStaticTotal(userId);

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

  async getUserCollection(userId: string, page: number, pageSize: number, tier?: string, search?: string, sortBy?: string): Promise<any[]> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let countQuery = this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (tier) countQuery = countQuery.eq('tier', tier);
    if (search) countQuery = countQuery.ilike('game_code', `%${search}%`);
    const { count: totalCount, error: countErr } = await countQuery;
    if (countErr) throw new InternalServerErrorException(`getUserCollection count: ${countErr.message}`);

    const sortColumn = sortBy === 'name' ? 'game_code' : sortBy === 'tier' ? 'tier_order' : 'drawn_at';
    const ascending = sortBy !== 'tier' && sortBy !== 'newest';

    let query = this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code, tier, xp_earned, is_favorite, drawn_at')
      .eq('user_id', userId)
      .order(sortColumn, { ascending });

    if (tier) {
      query = query.eq('tier', tier);
    }
    if (search) {
      query = query.ilike('game_code', `%${search}%`);
    }

    const { data, error } = await query.range(from, to);
    if (error) throw new InternalServerErrorException(`getUserCollection: ${error.message}`);
    return await this.mapCollectionRows(data, totalCount);
  }

  async getUserShowcase(userId: string, page = 1, pageSize = 50, sortBy?: string): Promise<any[]> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { count: totalCount, error: countErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_favorite', true);
    if (countErr) throw new InternalServerErrorException(`getUserShowcase count: ${countErr.message}`);

    const sortColumn = sortBy === 'name' ? 'game_code' : sortBy === 'tier' ? 'tier_order' : 'drawn_at';
    const ascending = sortBy !== 'tier' && sortBy !== 'newest';

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code, tier, xp_earned, is_favorite, drawn_at')
      .eq('user_id', userId)
      .eq('is_favorite', true)
      .order(sortColumn, { ascending })
      .range(from, to);
    if (error) throw new InternalServerErrorException(`getUserShowcase: ${error.message}`);

    return await this.mapCollectionRows(data, totalCount);
  }

  private async mapCollectionRows(data: any[] | null, totalCount: number | null): Promise<any[]> {
    if (!data || data.length === 0) {
      if (totalCount && totalCount > 0) {
        return [{ total_count: totalCount, empty_page: true }];
      }
      return [];
    }

    const rows = await this.joinGamesMaster(data);

    if (totalCount !== null && totalCount !== undefined) {
      rows[0] = { ...rows[0], total_count: totalCount };
    }
    return rows;
  }

  private async joinGamesMaster(rows: any[]): Promise<any[]> {
    if (!rows.length) return rows;
    const gameCodes = [...new Set(rows.map((r: any) => r.game_code).filter(Boolean))];
    if (!gameCodes.length) return rows;

    const { data: games, error: gamesErr } = await this.supabase
      .schema('projectgg')
      .from('games_master')
      .select('code, name, cover_url, rating, desc, genres, platforms, series_name, sequence_release')
      .in('code', gameCodes);
    if (gamesErr) throw new InternalServerErrorException(`joinGamesMaster: ${gamesErr.message}`);
    const gameMap = new Map<string, any>((games || []).map((g: any) => [g.code, g]));

    return rows.map((row: any) => {
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
        release_year: (game as any).sequence_release ?? null,
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

  async createTrade(
    proposerId: string,
    proposerCardIds: number[],
    receiverId: string,
    receiverCardIds: number[],
    allowUnfair = false,
    message: string | null = null,
    parentTradeId: number | null = null,
  ): Promise<number> {
    if (!proposerCardIds?.length) throw new InternalServerErrorException('No proposer cards provided');
    if (!receiverCardIds?.length) throw new InternalServerErrorException('No receiver cards provided');

    // Verify proposer owns every offered card and pull their game_codes
    const { data: proposerCards, error: proposerErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code')
      .in('id', proposerCardIds);
    if (proposerErr) throw new InternalServerErrorException(`createTrade proposer: ${proposerErr.message}`);
    if (!proposerCards || proposerCards.length !== proposerCardIds.length) {
      throw new InternalServerErrorException('One or more proposer cards not found');
    }
    for (const c of proposerCards as any[]) {
      if (c.user_id !== proposerId) throw new InternalServerErrorException('You do not own one of the offered cards');
    }

    // Verify receiver owns every requested card
    const { data: receiverCards, error: receiverErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code')
      .in('id', receiverCardIds);
    if (receiverErr) throw new InternalServerErrorException(`createTrade receiver: ${receiverErr.message}`);
    if (!receiverCards || receiverCards.length !== receiverCardIds.length) {
      throw new InternalServerErrorException('One or more receiver cards not found');
    }
    for (const c of receiverCards as any[]) {
      if (c.user_id !== receiverId) throw new InternalServerErrorException('Receiver does not own one of the requested cards');
    }

    // No duplicate game_codes within each side
    const pCodes = (proposerCards as any[]).map(c => c.game_code);
    const rCodes = (receiverCards as any[]).map(c => c.game_code);
    if (new Set(pCodes).size !== pCodes.length) {
      throw new InternalServerErrorException('Duplicate cards on proposer side');
    }
    if (new Set(rCodes).size !== rCodes.length) {
      throw new InternalServerErrorException('Duplicate cards on receiver side');
    }

    // Check proposer doesn't already own any of the requested game_codes
    for (const code of rCodes) {
      const { data: has } = await this.supabase
        .schema('projectgg')
        .from('card_collections')
        .select('id')
        .eq('user_id', proposerId)
        .eq('game_code', code)
        .limit(1);
      if (has && has.length > 0) throw new InternalServerErrorException(`You already have a card for ${code}`);
    }
    // Check receiver doesn't already own any of the offered game_codes
    for (const code of pCodes) {
      const { data: has } = await this.supabase
        .schema('projectgg')
        .from('card_collections')
        .select('id')
        .eq('user_id', receiverId)
        .eq('game_code', code)
        .limit(1);
      if (has && has.length > 0) throw new InternalServerErrorException(`Receiver already has a card for ${code}`);
    }

    const insertRow: any = {
      proposer_id: proposerId,
      proposer_cards: proposerCardIds,
      receiver_id: receiverId,
      receiver_cards: receiverCardIds,
      proposer_card: proposerCardIds[0],
      receiver_card: receiverCardIds[0],
      status: 'pending',
      type: 'trade',
      allow_unfair: allowUnfair,
    };
    if (message) insertRow.message = message;
    if (parentTradeId) insertRow.parent_trade_id = parentTradeId;

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .insert(insertRow)
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

  async getCardTiers(cardIds: number[]): Promise<Record<number, string>> {
    if (!cardIds?.length) return {};
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, tier')
      .in('id', cardIds);
    if (error) return {};
    const map: Record<number, string> = {};
    for (const row of (data || []) as any[]) {
      map[row.id] = row.tier ?? 'common';
    }
    return map;
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
      .select('id, user_id, game_code')
      .eq('id', gifterCardId)
      .single();
    if (cardErr || !card) throw new InternalServerErrorException('Card not found');
    if (card.user_id !== gifterId) throw new InternalServerErrorException('You do not own this card');

    // Check receiver doesn't already have this card
    const { data: existing } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id')
      .eq('user_id', receiverId)
      .eq('game_code', card.game_code)
      .limit(1);
    if (existing && existing.length > 0) throw new InternalServerErrorException('Receiver already has this card');

    // Record gift in card_trades for tracking
    const { error: tradeErr } = await this.supabase
      .schema('projectgg')
      .from('card_trades')
      .insert({
        proposer_id: gifterId,
        proposer_cards: [gifterCardId],
        proposer_card: gifterCardId,
        receiver_id: receiverId,
        receiver_cards: [gifterCardId],
        receiver_card: gifterCardId,
        status: 'accepted',
        type: 'gift',
        allow_unfair: true,
        resolved_at: new Date().toISOString(),
      });
    if (tradeErr) throw new InternalServerErrorException(`giftCard trade record: ${tradeErr.message}`);

    // Fetch full card details before deleting
    const { data: fullCard } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('game_code, tier, xp_earned, is_favorite, drawn_at')
      .eq('id', gifterCardId)
      .single();

    // Delete original entry from gifter's collection
    const { error: delErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .delete()
      .eq('id', gifterCardId);
    if (delErr) throw new InternalServerErrorException(`giftCard delete: ${delErr.message}`);

    // Insert new entry for receiver (preserves XP, tier, drawn_at)
    const { error: insErr } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .insert({
        user_id: receiverId,
        game_code: fullCard?.game_code,
        tier: fullCard?.tier,
        xp_earned: fullCard?.xp_earned ?? 0,
        is_favorite: false,
        drawn_at: fullCard?.drawn_at ?? new Date().toISOString(),
      });
    if (insErr) throw new InternalServerErrorException(`giftCard insert: ${insErr.message}`);
    await this.incrementStaticTotal(receiverId);

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

    // Determine which side is being accepted (receiver accepts original; proposer accepts counter)
    const isCounter = !!trade.parent_trade_id;
    const isReceiver = trade.receiver_id === userId;
    const isProposer = trade.proposer_id === userId;
    if (!isReceiver && !(isCounter && isProposer)) {
      throw new InternalServerErrorException('Not authorized to accept this trade');
    }
    if (trade.status !== 'pending') throw new InternalServerErrorException('Trade is no longer pending');

    // For a counter, the "active" side is the counter_ arrays (counter_proposer_cards belong to original receiver,
    // counter_receiver_cards belong to original proposer). For the original, it's proposer_cards/receiver_cards.
    const proposerCardIds: number[] = isCounter
      ? (trade.counter_proposer_cards?.length ? trade.counter_proposer_cards : trade.proposer_cards)
      : (trade.proposer_cards?.length ? trade.proposer_cards : [trade.proposer_card]);
    const receiverCardIds: number[] = isCounter
      ? (trade.counter_receiver_cards?.length ? trade.counter_receiver_cards : trade.receiver_cards)
      : (trade.receiver_cards?.length ? trade.receiver_cards : [trade.receiver_card]);

    if (!proposerCardIds?.length || !receiverCardIds?.length) {
      throw new InternalServerErrorException('Trade is missing card references');
    }

    // Fetch card details to validate duplicates by game_code
    const { data: proposerCards } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code')
      .in('id', proposerCardIds);
    const { data: receiverCards } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, user_id, game_code')
      .in('id', receiverCardIds);

    for (const c of (proposerCards || []) as any[]) {
      if (c.user_id !== trade.proposer_id) throw new InternalServerErrorException('Proposer no longer owns a card in this trade');
    }
    for (const c of (receiverCards || []) as any[]) {
      if (c.user_id !== trade.receiver_id) throw new InternalServerErrorException('Receiver no longer owns a card in this trade');
    }

    // Duplicate checks (no side may already have any of the other side's game_codes)
    for (const c of (proposerCards || []) as any[]) {
      const { data: has } = await this.supabase
        .schema('projectgg')
        .from('card_collections')
        .select('id')
        .eq('user_id', trade.receiver_id)
        .eq('game_code', c.game_code)
        .limit(1);
      if (has && has.length > 0) throw new InternalServerErrorException(`Receiver already has a card for ${c.game_code}`);
    }
    for (const c of (receiverCards || []) as any[]) {
      const { data: has } = await this.supabase
        .schema('projectgg')
        .from('card_collections')
        .select('id')
        .eq('user_id', trade.proposer_id)
        .eq('game_code', c.game_code)
        .limit(1);
      if (has && has.length > 0) throw new InternalServerErrorException(`Proposer already has a card for ${c.game_code}`);
    }

    // Fetch full card details before deleting
    const { data: proposerCardsFull } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, game_code, tier, xp_earned, drawn_at')
      .in('id', proposerCardIds);
    const { data: receiverCardsFull } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .select('id, game_code, tier, xp_earned, drawn_at')
      .in('id', receiverCardIds);

    // Delete original entries from both parties
    const { error: delErr1 } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .delete()
      .in('id', receiverCardIds);
    if (delErr1) throw new InternalServerErrorException(`acceptTrade delete receiver cards: ${delErr1.message}`);

    const { error: delErr2 } = await this.supabase
      .schema('projectgg')
      .from('card_collections')
      .delete()
      .in('id', proposerCardIds);
    if (delErr2) throw new InternalServerErrorException(`acceptTrade delete proposer cards: ${delErr2.message}`);

    // Insert new entries — receiver's cards go to proposer, proposer's cards go to receiver
    const receiverRows = (receiverCardsFull || []).map((c: any) => ({
      user_id: trade.proposer_id,
      game_code: c.game_code,
      tier: c.tier,
      xp_earned: c.xp_earned ?? 0,
      is_favorite: false,
      drawn_at: c.drawn_at ?? new Date().toISOString(),
    }));
    if (receiverRows.length) {
      const { error: insErr1 } = await this.supabase
        .schema('projectgg')
        .from('card_collections')
        .insert(receiverRows);
      if (insErr1) throw new InternalServerErrorException(`acceptTrade insert receiver cards: ${insErr1.message}`);
    }

    const proposerRows = (proposerCardsFull || []).map((c: any) => ({
      user_id: trade.receiver_id,
      game_code: c.game_code,
      tier: c.tier,
      xp_earned: c.xp_earned ?? 0,
      is_favorite: false,
      drawn_at: c.drawn_at ?? new Date().toISOString(),
    }));
    if (proposerRows.length) {
      const { error: insErr2 } = await this.supabase
        .schema('projectgg')
        .from('card_collections')
        .insert(proposerRows);
      if (insErr2) throw new InternalServerErrorException(`acceptTrade insert proposer cards: ${insErr2.message}`);
    }

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

  async getUserTrades(userId: string, otherUserId?: string): Promise<any[]> {
    // Fetch trades where user is proposer or receiver
    let query = this.supabase
      .schema('projectgg')
      .from('card_trades')
      .select('*')
      .or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`);

    if (otherUserId) {
      query = query.or(`proposer_id.eq.${otherUserId},receiver_id.eq.${otherUserId}`);
    }

    const { data: trades, error: tradesErr } = await query.order('created_at', { ascending: false });
    if (tradesErr) throw new InternalServerErrorException(`getUserTrades: ${tradesErr.message}`);
    if (!trades || trades.length === 0) return [];

    // Collect user IDs and card IDs from both single and array columns
    const userIds = [...new Set(trades.flatMap(t => [t.proposer_id, t.receiver_id]))];
    const cardIds: number[] = [];
    for (const t of trades as any[]) {
      for (const id of t.proposer_cards || []) cardIds.push(id);
      for (const id of t.receiver_cards || []) cardIds.push(id);
      for (const id of t.counter_proposer_cards || []) cardIds.push(id);
      for (const id of t.counter_receiver_cards || []) cardIds.push(id);
      if (t.proposer_card) cardIds.push(t.proposer_card);
      if (t.receiver_card) cardIds.push(t.receiver_card);
    }
    const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];

    // Fetch users
    const { data: users, error: usersErr } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('id, username, avatar, name, gender, status')
      .in('id', userIds);
    if (usersErr) throw new InternalServerErrorException(`getUserTrades users: ${usersErr.message}`);
    const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));

    // Fetch cards
    const { data: cards, error: cardsErr } = uniqueCardIds.length
      ? await this.supabase
          .schema('projectgg')
          .from('card_collections')
          .select('id, game_code, tier')
          .in('id', uniqueCardIds)
      : { data: [] as any[], error: null as any };
    if (cardsErr) throw new InternalServerErrorException(`getUserTrades cards: ${cardsErr.message}`);
    const cardMap = new Map<number, any>((cards || []).map((c: any) => [c.id, c]));

    // Fetch game covers
    const gameCodes = [...new Set(((cards || []) as any[]).map((c: any) => c.game_code).filter(Boolean))];
    const { data: games, error: gamesErr } = gameCodes.length
      ? await this.supabase
          .schema('projectgg')
          .from('games_master')
          .select('code, cover_url, name')
          .in('code', gameCodes)
      : { data: [] as any[], error: null as any };
    if (gamesErr) throw new InternalServerErrorException(`getUserTrades games: ${gamesErr.message}`);
    const gameMap = new Map<string, any>((games || []).map((g: any) => [g.code, g]));

    const expandCards = (ids: number[] | null | undefined) => {
      if (!ids?.length) return [];
      return ids.map((id: number) => {
        const c = cardMap.get(id);
        const game = c ? gameMap.get((c as any).game_code) : null;
        return {
          card_id: id,
          game_code: (c as any)?.game_code ?? null,
          game_name: (game as any)?.name ?? null,
          cover_url: (game as any)?.cover_url ?? null,
          tier: (c as any)?.tier ?? null,
        };
      });
    };

    // Assemble result
    return trades.map((t: any) => {
      const proposer = userMap.get(t.proposer_id);
      const receiver = userMap.get(t.receiver_id);

      const proposerCards = expandCards(t.proposer_cards?.length ? t.proposer_cards : (t.proposer_card ? [t.proposer_card] : []));
      const receiverCards = expandCards(t.receiver_cards?.length ? t.receiver_cards : (t.receiver_card ? [t.receiver_card] : []));
      const counterProposerCards = expandCards(t.counter_proposer_cards);
      const counterReceiverCards = expandCards(t.counter_receiver_cards);

      // For backwards compat with frontend single-card fields, expose the first card
      const proposerCard = proposerCards[0];
      const receiverCard = receiverCards[0];

      return {
        trade_id: t.id,
        trade_status: t.status,
        type: t.type || 'trade',
        proposer_id: t.proposer_id,
        proposer_name: (proposer as any)?.username ?? null,
        proposer_avatar: (proposer as any)?.avatar ?? null,
        proposer_tier: proposerCard?.tier ?? null,
        proposer_card_id: proposerCard?.card_id ?? t.proposer_card ?? null,
        proposer_game_code: proposerCard?.game_code ?? null,
        proposer_cover: proposerCard?.cover_url ?? null,
        proposer_cards: proposerCards,
        proposer_cards_count: proposerCards.length,
        receiver_id: t.receiver_id,
        receiver_name: (receiver as any)?.username ?? null,
        receiver_avatar: (receiver as any)?.avatar ?? null,
        receiver_tier: receiverCard?.tier ?? null,
        receiver_card_id: receiverCard?.card_id ?? t.receiver_card ?? null,
        receiver_game_code: receiverCard?.game_code ?? null,
        receiver_cover: receiverCard?.cover_url ?? null,
        receiver_cards: receiverCards,
        receiver_cards_count: receiverCards.length,
        counter_proposer_cards: counterProposerCards,
        counter_receiver_cards: counterReceiverCards,
        parent_trade_id: t.parent_trade_id ?? null,
        message: t.message ?? null,
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
    const stats = data?.[0] || {};

    const { data: user } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('static_total_cards, favorite_cards')
      .eq('id', userId)
      .single();

    return {
      ...stats,
      static_total_cards: user?.static_total_cards ?? 0,
      favorite_cards: user?.favorite_cards ?? 0,
    };
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
