import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';

@Injectable()
export class TasksRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  async getAvailable(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_available_tasks', {
      in_user_id: userId,
    });
    if (error) {
      throw new InternalServerErrorException(`get_available_tasks failed: ${error.message}`);
    }
    return data || [];
  }

  async getCompleted(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('user_completed_tasks')
      .select('*, tasks(*)')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false });
    if (error) {
      throw new InternalServerErrorException(`getCompleted failed: ${error.message}`);
    }
    return data || [];
  }

  async collectGameViaTask(userId: string, taskId: number): Promise<any> {
    const { data, error } = await this.supabase.rpc('collect_game_via_task', {
      in_user_id: userId,
      in_task_id: taskId,
    });
    if (error) {
      throw new InternalServerErrorException(`collect_game_via_task failed: ${error.message}`);
    }
    return data || { success: false, error: 'Unknown error' };
  }

  async getCollectedGames(userId: string, page = 1, pageSize = 12): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_user_collected_games', {
      in_user_id: userId,
      in_page_number: page,
      in_page_size: pageSize,
    });
    if (error) {
      throw new InternalServerErrorException(`get_user_collected_games failed: ${error.message}`);
    }
    return data || [];
  }
}
