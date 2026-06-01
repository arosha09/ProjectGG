import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Game } from '../models/game.model';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  task_kind?: 'duration' | 'achievement' | 'test';
  achievement_type?: string | null;
  category?: string | null;
  criteria?: Record<string, any> | null;
  reward_type: 'xp' | 'tickets';
  reward_amount: number;
  rewards?: Array<{ type: 'xp' | 'tickets'; amount: number }>;
  max_claims?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  active?: boolean;
  current_progress?: number;
  target_progress?: number;
  progress_percent?: number;
  is_achievement?: boolean;
  is_daily?: boolean;
  duration_minutes?: number;
  elapsed_seconds?: number;
}

export interface CompleteTaskResult {
  success: boolean;
  xp_awarded: number;
  task_id: number;
}

export interface CollectionStats {
  total_cards: number;
  static_total_cards: number;
  favorite_cards: number;
  legendary: number;
  epic: number;
  rare: number;
  uncommon: number;
  common: number;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly api = environment.apiUrl;
  constructor(private readonly http: HttpClient) {}

  listPublic(): Observable<Task[]> { return this.http.get<Task[]>(`${this.api}/tasks`); }
  createTask(payload: any): Observable<any> { return this.http.post<any>(`${this.api}/tasks`, payload); }
  updateTask(id: number, payload: any): Observable<any> { return this.http.put<any>(`${this.api}/tasks/${id}`, payload); }
  deleteTask(id: number): Observable<any> { return this.http.delete<any>(`${this.api}/tasks/${id}`); }
  getTask(id: number): Observable<Task> { return this.http.get<Task>(`${this.api}/tasks/${id}`); }

  getAvailable(): Observable<Task[]> { return this.http.get<Task[]>(`${this.api}/tasks`); }
  getAvailableWithProgress(): Observable<Task[]> { return this.http.get<Task[]>(`${this.api}/tasks/available`); }
  getCompleted(): Observable<any[]> { return this.http.get<any[]>(`${this.api}/tasks/completed`); }
  getDailyTasks(): Observable<Task[]> { return this.http.get<Task[]>(`${this.api}/tasks/daily`); }
  getDurationTasks(): Observable<Task[]> { return this.http.get<Task[]>(`${this.api}/tasks/duration`); }
  getAchievementTasks(): Observable<any[]> { return this.http.get<any[]>(`${this.api}/tasks/achievements`); }
  checkAutoComplete(): Observable<any[]> { return this.http.post<any[]>(`${this.api}/tasks/check-auto-complete`, {}); }

  completeTask(taskId: number, force = false): Observable<CompleteTaskResult> {
    const params = force ? { force: 'true' } : undefined;
    return this.http.post<CompleteTaskResult>(`${this.api}/tasks/complete/${taskId}`, null, { params });
  }

  heartbeat(taskType: string, durationSeconds: number): Observable<any> {
    return this.http.post<any>(`${this.api}/tasks/heartbeat`, { task_type: taskType, duration_seconds: durationSeconds });
  }

  getCollectedGames(page = 1, pageSize = 12): Observable<Game[]> { return this.http.get<Game[]>(`${this.api}/tasks/collected`, { params: { page, page_size: pageSize } }); }

  getCollectionStats(): Observable<CollectionStats> { return this.http.get<CollectionStats>(`${this.api}/cards/collection/stats`); }
}
