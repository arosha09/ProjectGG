import {
  Injectable,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

@Injectable()
export class XpRepository {
  private readonly supabaseUrl: string;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    configService: ConfigService,
  ) {
    this.supabaseUrl = configService.get<string>('SUPABASE_URL') ?? '';
  }

  private async rankImageUrl(rankCode: string): Promise<string> {
    if (!rankCode) return '';
    const { data, error } = await this.supabase.storage
      .from('system_files')
      .createSignedUrl(`ranks/${rankCode}.png`, 315360000);
    if (error || !data?.signedUrl) return '';
    return data.signedUrl;
  }

  async getUserRank(userId: string): Promise<any> {
    const functionName = 'get_user_rank';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    const rank = (Array.isArray(data) ? data[0] : data) || null;
    if (rank) {
      rank.rank_image_url = await this.rankImageUrl(rank.rank_code);
      if (rank.next_rank_code && rank.next_rank_code !== 'MAX') {
        rank.next_rank_image_url = await this.rankImageUrl(rank.next_rank_code);
      }
    }
    return rank;
  }

  async awardCharacterEvents(userId: string, events: any[]) {
    const { data, error } = await this.supabase.rpc('award_character_xp_events', {
      in_user_id: userId, in_events: events,
    });
    if (error) throw new InternalServerErrorException(`Character XP sync failed: ${error.message}`);
    const result = Array.isArray(data) ? data[0] : data;
    return { ...result, rank: await this.getUserRank(userId) };
  }

  async awardDailyLogin(userId: string): Promise<any> {
    const functionName = 'award_daily_login';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data?.[0] || null;
  }

  async canClaimDaily(userId: string): Promise<any> {
    const functionName = 'can_claim_daily';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data?.[0] || null;
  }

  async awardCustomXp(
    userId: string,
    xp: number,
    source: string,
    sourceId?: string,
  ): Promise<any> {
    const functionName = 'award_custom_xp';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
      in_xp: xp,
      in_source: source,
      in_source_id: sourceId || null,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data?.[0] || null;
  }

  async getLeaderboard(limit: number): Promise<any[]> {
    const functionName = 'get_leaderboard';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_limit: limit,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data || [];
  }

  async addXp(
    userId: string,
    xp: number,
    source: string,
    sourceId?: string,
  ): Promise<any> {
    const functionName = 'add_xp';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
      in_xp: xp,
      in_source: source,
      in_source_id: sourceId || null,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data?.[0] || null;
  }

  async awardFirstGameBonus(userId: string): Promise<any> {
    const functionName = 'award_first_game_bonus';
    const { data, error } = await this.supabase.rpc(functionName, {
      in_user_id: userId,
    });
    if (error) {
      throw new InternalServerErrorException(
        `${functionName} failed: ${error.message}`,
      );
    }
    return data;
  }
}
