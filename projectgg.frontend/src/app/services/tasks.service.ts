import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Game } from '../models/game.model';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  reward_game_code: string | null;
  xp_reward: number;
  criteria: any;
  icon: string | null;
  created_at: string;
}

export interface CompleteTaskResult {
  success: boolean;
  game_code: string;
  xp_awarded: number;
  task_id: number;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getAvailable(): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}/tasks`);
  }

  getCompleted(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/tasks/completed`);
  }

  completeTask(taskId: number): Observable<CompleteTaskResult> {
    return this.http.post<CompleteTaskResult>(`${this.apiUrl}/tasks/complete/${taskId}`, null);
  }

  getCollectedGames(page = 1, pageSize = 12): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.apiUrl}/tasks/collected`, {
      params: { page, page_size: pageSize },
    });
  }
}
