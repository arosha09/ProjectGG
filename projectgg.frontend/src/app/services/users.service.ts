import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<any>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();
  token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('currentUser');
    const refreshToken = localStorage.getItem('refresh_token');

    if (token) {
      this.tokenSubject.next(token);
    }

    if (refreshToken) {
      this.refreshTokenSubject.next(refreshToken);
    }

    if (user) {
      try {
        this.currentUserSubject.next(JSON.parse(user));
      } catch {
        this.currentUserSubject.next(null);
      }
    }
  }

  register(payload: { name: string; username: string; email: string; date_of_birth: Date; gender: string; password_hash: string; role?: string; avatar?: string; }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/register`, payload).pipe(
      tap((response) => this.syncAuthState(response))
    );
  }

  login(payload: { email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, payload).pipe(
      timeout(30000),
      tap((response) => this.syncAuthState(response))
    );
  }

  refreshToken(): Observable<any> {
    const refresh_token = this.refreshTokenSubject.value;
    if (!refresh_token) {
      return new Observable((sub) => {
        sub.error(new Error('No refresh token'));
      });
    }
    return this.http.post<any>(`${this.apiUrl}/auth/refresh`, { refresh_token }).pipe(
      tap((response) => this.syncAuthState(response))
    );
  }

  getMe(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/me`);
  }

  getUserDetails(userId?: string, username?: string): Observable<any> {
    let params = new HttpParams();

    if (userId) {
      params = params.set('user_id', userId);
    }

    if (username) {
      params = params.set('username', username);
    }

    return this.http.get(`${this.apiUrl}/users/get-user-details`, { params });
  }

  logout(): void {
    this.currentUserSubject.next(null);
    this.tokenSubject.next(null);
    this.refreshTokenSubject.next(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('currentUser');
  }

  getToken(): string | null {
    return this.tokenSubject.value;
  }

  getRefreshToken(): string | null {
    return this.refreshTokenSubject.value;
  }

  getCurrentUser(): any {
    return this.currentUserSubject.value;
  }

  updateCurrentUser(user: any): void {
    localStorage.setItem('currentUser', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  isAuthenticated(): boolean {
    return !!this.tokenSubject.value;
  }

  private syncAuthState(response: any): void {
    const token = response?.token;
    const refreshToken = response?.refresh_token;
    const user = response?.user;

    if (token) {
      localStorage.setItem('token', token);
      this.tokenSubject.next(token);
    }

    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
      this.refreshTokenSubject.next(refreshToken);
    }

    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
      this.currentUserSubject.next(user);
    }
  }

  uploadBanner(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/users/profile/banner`, fd);
  }

  deleteBanner(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/users/profile/banner`);
  }
}