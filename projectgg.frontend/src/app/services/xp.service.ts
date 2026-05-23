import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserRankDto, DailyClaimDto, CanClaimDailyDto } from '../models/rank.model';

@Injectable({
  providedIn: 'root'
})
export class XpService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getUserRank(userId?: string): Observable<UserRankDto> {
    const params: any = {};
    if (userId) params.user_id = userId;
    return this.http.get<UserRankDto>(`${this.apiUrl}/xp/rank`, { params });
  }

  claimDaily(userId?: string): Observable<DailyClaimDto> {
    const body: any = {};
    if (userId) body.user_id = userId;
    return this.http.post<DailyClaimDto>(`${this.apiUrl}/xp/daily-claim`, body);
  }

  canClaimDaily(userId?: string): Observable<CanClaimDailyDto> {
    const params: any = {};
    if (userId) params.user_id = userId;
    return this.http.get<CanClaimDailyDto>(`${this.apiUrl}/xp/can-claim-daily`, { params });
  }
}
