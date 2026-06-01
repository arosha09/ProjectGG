import { Injectable, InternalServerErrorException, ForbiddenException, Inject } from '@nestjs/common';
import { TasksRepository } from './tasks.repository';
import { XpService } from '../../services/xp.service';
import { CardCollectionService } from '../card-collection/card-collection.service';
import { ChatGateway } from '../chat/chat.gateway';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';

@Injectable()
export class TasksService {
  constructor(
    private readonly repo: TasksRepository,
    private readonly xpService: XpService,
    private readonly cardCollectionService: CardCollectionService,
    private readonly chatGateway: ChatGateway,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
  ) {}

  async createTask(payload: any, createdBy: string) {
    const now = new Date().toISOString();
    const rewards = Array.isArray(payload.rewards) ? payload.rewards : [];
    const primaryReward = rewards[0] ?? null;
    const task = {
      title: payload.title,
      description: payload.description ?? null,
      task_kind: payload.task_kind ?? 'duration',
      achievement_type: payload.achievement_type ?? null,
      category: payload.category ?? null,
      duration_minutes: payload.duration_minutes ?? null,
      criteria: payload.criteria ?? {},
      reward_type: primaryReward?.type ?? payload.reward_type ?? 'xp',
      reward_amount: primaryReward?.amount ?? payload.reward_amount ?? 0,
      rewards,
      max_claims: payload.max_claims ?? null,
      start_at: payload.start_at ?? now,
      end_at: payload.end_at ?? null,
      active: payload.active ?? true,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    };
    return this.repo.createTask(task);
  }

  async updateTask(id: number, patch: any) {
    return this.repo.updateTask(id, { ...patch, updated_at: new Date().toISOString() });
  }

  async deleteTask(id: number) {
    return this.repo.deleteTask(id);
  }

  async listTasks(activeOnly = true) {
    return this.repo.listTasks(activeOnly);
  }

  async getTask(id: number) {
    return this.repo.getTask(id);
  }

  async getProfileAchievementProgress(userId: string) {
    const stats = await this.repo.getCollectionStats(userId);
    return {
      cards_collected: Number(stats?.static_total_cards ?? stats?.total_cards ?? 0),
      cards_favorited: Number(stats?.favorite_cards ?? 0),
    };
  }

  async getAvailable(userId: string) {
    return this.repo.getAvailable(userId);
  }

  async getCompleted(userId: string) {
    return this.repo.getCompleted(userId);
  }

  async getDailyTasks(userId: string) {
    const tasks = await this.repo.getAvailable(userId);
    const now = new Date();
    
    return tasks.filter((task: any) => {
      if (task.task_kind === 'duration') {
        const start = task.start_at ? new Date(task.start_at) : null;
        const end = task.end_at ? new Date(task.end_at) : null;
        if (!start) return false;
        
        const isSameDay = start.toDateString() === now.toDateString() ||
                         (end && start.toDateString() === end.toDateString());
        return isSameDay || (now >= start && (!end || now <= end));
      }
      return false;
    }).map((task: any) => ({
      ...task,
      is_daily: true,
    }));
  }

  async getAchievementTasks(userId: string) {
    const tasks = await this.repo.getAvailable(userId);
    const grouped = new Map<string, any[]>();
    
    const achievements = tasks
      .filter((task: any) => task.task_kind === 'achievement' || task.is_achievement)
      .map((task: any) => ({
        ...task,
        is_achievement: true,
        category: task.category || 'General',
      }));
    
    for (const task of achievements) {
      const cat = task.category || 'General';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(task);
    }
    
    return Array.from(grouped.entries()).map(([category, tasks]) => ({
      category,
      tasks,
    }));
  }

  async checkAndAutoComplete(userId: string): Promise<any[]> {
    const tasks = await this.repo.getAvailable(userId);
    const progress = await this.getProfileAchievementProgress(userId);
    const durationProgress = await this.repo.getDurationTaskProgress(userId);
    const completedTasks: any[] = [];

    for (const task of tasks) {
      const achievementKey = task.achievement_type || task.criteria?.achievement_type;
      const target = Number(task.criteria?.['target'] ?? task.reward_amount ?? 0);
      
      let current = 0;
      let isComplete = false;
      
      if (task.task_kind === 'achievement' && achievementKey) {
        current = Number(progress[achievementKey] ?? 0);
        isComplete = current >= target;
      } else if (task.task_kind === 'duration') {
        const elapsed = durationProgress[task.id] || 0;
        const required = (task.duration_minutes || 30) * 60;
        isComplete = elapsed >= required;
      }
      
      if (isComplete) {
        try {
          await this.completeTask(userId, task.id);
          completedTasks.push(task);
        } catch {}
      }
    }
    
    return completedTasks;
  }

  async getDurationTasks(userId: string) {
    const tasks = await this.repo.getAvailable(userId);
    return tasks
      .filter((task: any) => (task.task_kind === 'duration' || task.task_kind === 'test') && !task.is_daily)
      .map((task: any) => ({
        ...task,
        duration_minutes: task.duration_minutes || 30,
        elapsed_seconds: 0,
      }));
  }

  async recordHeartbeat(userId: string, taskType: string, durationSeconds: number) {
    const result = await this.supabase.rpc('record_duration_heartbeat', {
      in_user_id: userId,
      in_task_type: taskType,
      in_duration_seconds: durationSeconds,
    });

    if (result.error) {
      const message = String(result.error?.message ?? '').toLowerCase();
      const code = String(result.error?.code ?? '');
      const missingFn = code === 'PGRST202' || message.includes('could not find the function');
      if (missingFn) {
        throw new InternalServerErrorException(
          [
            `record_duration_heartbeat failed: ${result.error.message}`,
            'Missing RPC. Run SQL:',
            '-- Run in Supabase SQL editor',
            'create or replace function public.record_duration_heartbeat(in_user_id uuid, in_task_type text, in_duration_seconds integer)',
            'returns jsonb',
            'language plpgsql',
            'security definer',
            'as $$',
            'declare',
            '  v_task_id integer;',
            'begin',
            '  select id into v_task_id',
            '  from projectgg.tasks',
            "  where task_kind = 'duration' and coalesce(achievement_type, '') = coalesce(in_task_type, '') and active = true",
            '  order by id asc',
            '  limit 1;',
            '',
            '  if v_task_id is null then',
            "    return jsonb_build_object('ok', false, 'reason', 'task_not_found');",
            '  end if;',
            '',
            '  insert into projectgg.duration_task_heartbeats(user_id, task_id, duration_seconds)',
            '  values (in_user_id, v_task_id, greatest(coalesce(in_duration_seconds, 0), 0));',
            '',
            "  return jsonb_build_object('ok', true, 'task_id', v_task_id);",
            'end;',
            '$$;',
            '',
            "notify pgrst, 'reload schema';",
          ].join('\n'),
        );
      }
      throw new InternalServerErrorException('Failed to record heartbeat');
    }

    return result.data;
  }

  async completeTask(userId: string, taskId: number, forceComplete = false) {
    const task = await this.repo.getTask(taskId);
    
    if (task.task_kind === 'duration' && !forceComplete) {
      const progress = await this.repo.getDurationProgress(userId, taskId);
      const requiredSeconds = (task.duration_minutes || 30) * 60;
      if (progress < requiredSeconds) {
        throw new ForbiddenException('Duration requirement not met');
      }
    }

    const existing = await this.repo.getUserTask(userId, taskId);
    if (existing?.claimed) {
      throw new ForbiddenException('Task already claimed');
    }

    const result = await this.repo.collectGameViaTask(userId, taskId);
    if (!result || result.success === false) {
      throw new ForbiddenException(result?.error || 'Failed to complete task');
    }

    try {
      const rewards = Array.isArray(task?.rewards) && task.rewards.length > 0
        ? task.rewards
        : [{ type: task?.reward_type ?? 'xp', amount: Number(task?.reward_amount ?? 0) }];

      let totalXp = 0;
      for (const reward of rewards) {
        const amount = Number(reward?.amount ?? 0);
        if (amount <= 0) continue;

        if (reward?.type === 'xp') {
          totalXp += amount;
          try {
            await this.xpService.awardCustomXp(userId, amount, 'task_complete', String(taskId));
          } catch {}
        } else if (reward?.type === 'tickets') {
          for (let i = 0; i < amount; i++) {
            try {
              await this.cardCollectionService.awardTicket(userId, `task:${taskId}`);
            } catch {}
          }
        }
      }

      const notifBody = totalXp > 0 
        ? `You earned ${totalXp} XP from completing "${task?.title}"`
        : `You completed the task "${task?.title}"`;

      try {
        await this.chatGateway.createNotification(userId, 'task_completed', 'Task Completed!', notifBody, { taskId, xpAwarded: totalXp });
      } catch {}

      this.chatGateway.broadcastServerEvent('task-completed', {
        userId,
        taskId,
        taskTitle: task?.title,
        xpAwarded: totalXp,
      });
    } catch (e) {
      // non-critical
    }

    return result;
  }

  async getAvailableWithProgress(userId: string) {
    const tasks = await this.repo.getAvailable(userId);
    const progress = await this.getProfileAchievementProgress(userId);
    const durationProgress = await this.repo.getDurationTaskProgress(userId);

    return tasks.map((task: any) => {
      const achievementKey = task.achievement_type || task.criteria?.achievement_type;
      const target = Number(task.criteria?.['target'] ?? task.reward_amount ?? 0);

      let current = 0;
      if (task.task_kind === 'achievement' && achievementKey) {
        current = Number(progress[achievementKey] ?? 0);
      } else if (task.task_kind === 'duration' || task.task_kind === 'test') {
        current = durationProgress[task.id] || 0;
      }

      return {
        ...task,
        current_progress: current,
        target_progress: target,
        duration_minutes: task.duration_minutes || 30,
        elapsed_seconds: (task.task_kind === 'duration' || task.task_kind === 'test') ? current : undefined,
        progress_percent: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 
                       (task.task_kind === 'duration' || task.task_kind === 'test') ? Math.round((current / ((task.duration_minutes || 30) * 60)) * 100) : 0,
        is_achievement: task.task_kind === 'achievement',
      };
    });
  }

  async getCollectedGames(userId: string, page: number, pageSize: number) {
    return this.repo.getCollectedGames(userId, page, pageSize);
  }

  async getCollectionStats(userId: string) {
    return this.repo.getCollectionStats(userId);
  }
}