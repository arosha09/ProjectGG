import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

@Injectable()
export class TasksRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  private isMissingRpcFunction(error: any): boolean {
    const message = String(error?.message ?? '').toLowerCase();
    const code = String(error?.code ?? '');
    return code === 'PGRST202' || message.includes('could not find the function');
  }

  private durationRpcSetupSql(): string {
    return [
      '-- Run in Supabase SQL editor',
      'create or replace function public.get_duration_progress(in_user_id uuid, in_task_id integer)',
      'returns integer',
      'language sql',
      'stable',
      'as $$',
      '  select coalesce(sum(duration_seconds), 0)::integer',
      '  from projectgg.duration_task_heartbeats',
      '  where user_id = in_user_id and task_id = in_task_id;',
      '$$;',
      '',
      'create or replace function public.get_all_duration_progress(in_user_id uuid)',
      'returns table(task_id integer, progress_seconds integer)',
      'language sql',
      'stable',
      'as $$',
      '  select task_id, coalesce(sum(duration_seconds), 0)::integer as progress_seconds',
      '  from projectgg.duration_task_heartbeats',
      '  where user_id = in_user_id',
      '  group by task_id;',
      '$$;',
      '',
      "notify pgrst, 'reload schema';",
    ].join('\n');
  }

  private pc() {
    return this.supabase.schema('projectgg');
  }

  async createTask(task: any) {
    const { data, error } = await this.pc().from('tasks').insert(task).select().single();
    if (error) throw new InternalServerErrorException(error.message || error);
    return data;
  }

  async updateTask(id: number, patch: any) {
    const { data, error } = await this.pc().from('tasks').update(patch).eq('id', id).select().single();
    if (error) throw new InternalServerErrorException(error.message || error);
    return data;
  }

  async deleteTask(id: number) {
    const { error } = await this.pc().from('tasks').delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message || error);
    return { success: true };
  }

  async listTasks(activeOnly = true) {
    const q = this.pc().from('tasks').select('*');
    if (activeOnly) q.eq('active', true);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message || error);
    return data ?? [];
  }

  async getTask(id: number) {
    const { data, error } = await this.pc().from('tasks').select('*').eq('id', id).single();
    if (error) throw new InternalServerErrorException(error.message || error);
    return data;
  }

  async getUserTask(userId: string, taskId: number) {
    const { data, error } = await this.pc()
      .from('user_tasks')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw new InternalServerErrorException(error.message || error);
    return data || null;
  }

  async getOrCreateUserTask(taskId: number, userId: string) {
    const { data } = await this.pc().from('user_tasks').select('*').eq('task_id', taskId).eq('user_id', userId).single();
    if (data) return data;
    const { data: created, error } = await this.pc().from('user_tasks').insert({ task_id: taskId, user_id: userId }).select().single();
    if (error) throw new InternalServerErrorException(error.message || error);
    return created;
  }

  async claimTask(taskId: number, userId: string) {
    const { data: existing } = await this.pc()
      .from('user_tasks')
      .select('claims_count')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .single();
    const nextCount = (existing?.claims_count ?? 0) + 1;
    const { data, error } = await this.pc()
      .from('user_tasks')
      .update({ claimed: true, claimed_at: new Date().toISOString(), claims_count: nextCount })
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .select('claims_count')
      .single();
    if (error) throw new InternalServerErrorException(`claimTask: ${error.message}`);
    return data;
  }

  async getAvailable(userId: string): Promise<any[]> {
    const { data: tasks, error: taskErr } = await this.pc()
      .from('tasks')
      .select('*')
      .eq('active', true);
    if (taskErr) throw new InternalServerErrorException(`getAvailable tasks: ${taskErr.message}`);

    const { data: claimed, error: claimErr } = await this.pc()
      .from('user_tasks')
      .select('task_id, claimed, claims_count')
      .eq('user_id', userId);
    if (claimErr) throw new InternalServerErrorException(`getAvailable user_tasks: ${claimErr.message}`);

    const claimMap = new Map<number, any>((claimed || []).map((c: any) => [c.task_id, c]));

    return (tasks || [])
      .filter((t: any) => {
        const userClaim = claimMap.get(t.id);
        if (!userClaim || !userClaim.claimed) return true;
        const maxClaims = t.max_claims;
        if (!maxClaims || maxClaims <= 1) return false;
        return (userClaim.claims_count ?? 0) < maxClaims;
      })
      .sort((a: any, b: any) => {
        const ta = a.task_kind === 'achievement' ? 0 : a.task_kind === 'duration' ? 1 : 2;
        const tb = b.task_kind === 'achievement' ? 0 : b.task_kind === 'duration' ? 1 : 2;
        return ta - tb;
      });
  }

  async getCompleted(userId: string): Promise<any[]> {
    const { data, error } = await this.pc()
      .from('user_tasks')
      .select('*, tasks(*)')
      .eq('user_id', userId)
      .eq('claimed', true)
      .order('claimed_at', { ascending: false });
    if (error) throw new InternalServerErrorException(`getCompleted failed: ${error.message}`);
    return data || [];
  }

  async collectGameViaTask(userId: string, taskId: number): Promise<any> {
    const { data, error } = await this.supabase.rpc('collect_game_via_task', { in_user_id: userId, in_task_id: taskId });
    if (error) throw new InternalServerErrorException(`collect_game_via_task failed: ${error.message}`);
    return data || { success: false, error: 'Unknown error' };
  }

  async getCollectedGames(userId: string, page: number, pageSize: number): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('get_user_collection', { in_user_id: userId, in_page: page, in_page_size: pageSize });
    if (error) throw new InternalServerErrorException(`get_user_collection failed: ${error.message}`);
    return data || [];
  }

  async getCollectionStats(userId: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('get_collection_stats', { in_user_id: userId });
    if (error) throw new InternalServerErrorException(`get_collection_stats failed: ${error.message}`);
    return data?.[0] || null;
  }

  async getDurationProgress(userId: string, taskId: number): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_duration_progress', {
      in_user_id: userId,
      in_task_id: taskId,
    });
    if (error) {
      if (this.isMissingRpcFunction(error)) {
        throw new InternalServerErrorException(
          `get_duration_progress failed: ${error.message}\nMissing RPC. Run SQL:\n${this.durationRpcSetupSql()}`,
        );
      }
      throw new InternalServerErrorException(`get_duration_progress failed: ${error.message}`);
    }
    return data || 0;
  }

  async getDurationTaskProgress(userId: string): Promise<Record<number, number>> {
    const { data, error } = await this.supabase.rpc('get_all_duration_progress', { in_user_id: userId });
    if (error) {
      if (this.isMissingRpcFunction(error)) {
        throw new InternalServerErrorException(
          `get_all_duration_progress failed: ${error.message}\nMissing RPC. Run SQL:\n${this.durationRpcSetupSql()}`,
        );
      }
      throw new InternalServerErrorException(`get_all_duration_progress failed: ${error.message}`);
    }

    const result: Record<number, number> = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        result[item.task_id] = item.progress_seconds || 0;
      }
    }
    return result;
  }

  /**
   * Insert one heartbeat row for a (user, task) pair. The sum of all rows
   * is what getDurationProgress returns, so each tick adds `seconds` to
   * the task's accumulated time.
   */
  async insertDurationHeartbeat(userId: string, taskId: number, seconds: number): Promise<void> {
    if (seconds <= 0) return;
    const { error } = await this.pc()
      .from('duration_task_heartbeats')
      .insert({ user_id: userId, task_id: taskId, duration_seconds: seconds });
    if (error) {
      throw new InternalServerErrorException(`insertDurationHeartbeat: ${error.message}`);
    }
  }

  /**
   * Get the IDs of all active duration/test tasks the user has not yet
   * fully completed. Used by the realtime tick to know which tasks to
   * accumulate time for.
   */
  async getActiveDurationTaskIds(userId: string): Promise<number[]> {
    const { data: tasks, error } = await this.pc()
      .from('tasks')
      .select('id, max_claims')
       .in('task_kind', ['duration'])
      .eq('active', true);
    if (error) {
      throw new InternalServerErrorException(`getActiveDurationTaskIds: ${error.message}`);
    }
    if (!tasks || tasks.length === 0) return [];

    const ids = tasks.map(t => t.id);
    const { data: claims, error: claimErr } = await this.pc()
      .from('user_tasks')
      .select('task_id, claimed, claims_count')
      .eq('user_id', userId)
      .in('task_id', ids);
    if (claimErr) {
      throw new InternalServerErrorException(`getActiveDurationTaskIds claims: ${claimErr.message}`);
    }
    const claimMap = new Map<number, any>((claims || []).map((c: any) => [c.task_id, c]));

    return tasks
      .filter(t => {
        const c = claimMap.get(t.id);
        if (!c || !c.claimed) return true;
        const max = t.max_claims;
        if (!max || max <= 1) return false;
        return (c.claims_count ?? 0) < max;
      })
      .map(t => t.id);
  }
}