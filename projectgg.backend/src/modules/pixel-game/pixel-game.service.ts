import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { XpService } from '../../services/xp.service';
import { CardCollectionService } from '../card-collection/card-collection.service';

const SCORE_TO_XP = 5;
const TICKET_SCORE_THRESHOLD = 50;

interface EndRunInput {
  score: number;
  enemiesKilled: number;
  gemsCollected: number;
  monstersCaught?: string[];
}

@Injectable()
export class PixelGameService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => XpService))
    private readonly xp: XpService,
    @Inject(forwardRef(() => CardCollectionService))
    private readonly cards: CardCollectionService,
  ) {}

  async endRun(userId: string, input: EndRunInput) {
    const xpAwarded = Math.max(1, Math.floor(input.score / SCORE_TO_XP));
    const ticketsAwarded = input.score >= TICKET_SCORE_THRESHOLD ? 1 : 0;

    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('pixel_game_runs')
      .insert({
        user_id: userId,
        score: input.score,
        enemies_killed: input.enemiesKilled,
        gems_collected: input.gemsCollected,
        monsters_caught: input.monstersCaught ?? [],
        xp_awarded: xpAwarded,
        tickets_awarded: ticketsAwarded,
      })
      .select('id, score, xp_awarded, tickets_awarded, monsters_caught, created_at')
      .single();

    if (error) {
      return { error: error.message };
    }

    if (xpAwarded > 0) {
      await this.xp.awardCustomXp(userId, xpAwarded, 'pixel_quest', String(data.id));
    }

    if (ticketsAwarded > 0) {
      await this.cards.awardTicket(userId, 'pixel_quest');
    }

    const stats = await this.getStats(userId);

    this.realtime.emitToUser(userId, 'pixel-quest:run-ended', {
      runId: data.id,
      score: input.score,
      xpAwarded,
      ticketsAwarded,
    });

    return { run: data, stats };
  }

  async getStats(userId: string) {
    const { data: runs, error } = await this.supabase
      .schema('projectgg')
      .from('pixel_game_runs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return { error: error.message };

    const totalScore = runs.reduce((s: number, r: any) => s + (r.score ?? 0), 0);
    const totalXp = runs.reduce((s: number, r: any) => s + (r.xp_awarded ?? 0), 0);
    const totalTickets = runs.reduce((s: number, r: any) => s + (r.tickets_awarded ?? 0), 0);
    const highScore = runs.length > 0 ? Math.max(...runs.map((r: any) => r.score ?? 0)) : 0;
    const totalEnemies = runs.reduce((s: number, r: any) => s + (r.enemies_killed ?? 0), 0);
    const totalGems = runs.reduce((s: number, r: any) => s + (r.gems_collected ?? 0), 0);

    return {
      totalRuns: runs.length,
      totalScore,
      totalXp,
      totalTickets,
      highScore,
      totalEnemies,
      totalGems,
      recentRuns: runs.slice(0, 10),
    };
  }
}
