import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { TasksRepository } from './tasks.repository';
import { XpService } from '../../services/xp.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly xpService: XpService,
  ) {}

  async getAvailable(userId: string) {
    return this.tasksRepository.getAvailable(userId);
  }

  async getCompleted(userId: string) {
    return this.tasksRepository.getCompleted(userId);
  }

  async completeTask(userId: string, taskId: number) {
    const result = await this.tasksRepository.collectGameViaTask(userId, taskId);

    if (!result.success) {
      throw new ForbiddenException(result.error || 'Failed to complete task');
    }

    if (result.xp_awarded > 0) {
      try {
        await this.xpService.awardCustomXp(
          userId,
          result.xp_awarded,
          'task_complete',
          String(taskId),
        );
      } catch {
        // XP award is non-critical
      }
    }

    return result;
  }

  async getCollectedGames(userId: string, page: number, pageSize: number) {
    return this.tasksRepository.getCollectedGames(userId, page, pageSize);
  }
}
