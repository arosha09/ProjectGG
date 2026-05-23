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
      .createSignedUrl(`ranks/${rankCode}.png`, 60 * 60);
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
    const rank = data?.[0] || null;
    if (rank) {
      rank.rank_image_url = await this.rankImageUrl(rank.rank_code);
      if (rank.next_rank_code && rank.next_rank_code !== 'MAX') {
        rank.next_rank_image_url = await this.rankImageUrl(rank.next_rank_code);
      }
    }
    return rank;
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
}
