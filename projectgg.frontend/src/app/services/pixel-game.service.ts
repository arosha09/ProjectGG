import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EndRunResult {
  run: {
    id: number;
    score: number;
    xp_awarded: number;
    tickets_awarded: number;
    monsters_caught: string[];
    created_at: string;
  };
  stats: GameStats;
}

export interface GameStats {
  totalRuns: number;
  totalScore: number;
  totalXp: number;
  totalTickets: number;
  highScore: number;
  totalEnemies: number;
  totalGems: number;
  recentRuns: {
    id: number;
    score: number;
    enemies_killed: number;
    gems_collected: number;
    xp_awarded: number;
    tickets_awarded: number;
    created_at: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class PixelGameService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  endRun(data: { score: number; enemiesKilled: number; gemsCollected: number; monstersCaught?: string[] }): Observable<EndRunResult> {
    return this.http.post<EndRunResult>(`${this.apiUrl}/pixel-game/end-run`, data);
  }

  getStats(): Observable<GameStats> {
    return this.http.get<GameStats>(`${this.apiUrl}/pixel-game/stats`);
  }
}
