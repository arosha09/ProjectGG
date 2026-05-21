import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<any>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();
  token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const token = localStorage.getItem('token');
    const user = localStorage.getItem('currentUser');

    if (token) {
      this.tokenSubject.next(token);
    }

    if (user) {
      this.currentUserSubject.next(JSON.parse(user));
    }
  }

  register(payload: { name: string; username: string; email: string; password_hash: string; role?: string; avatar?: string; }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/register`, payload).pipe(
      tap((response) => this.syncAuthState(response))
    );
  }

  login(payload: { email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, payload).pipe(
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

    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('currentUser');
    }
  }

  getToken(): string | null {
    return this.tokenSubject.value;
  }

  getCurrentUser(): any {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return !!this.tokenSubject.value;
  }

  private syncAuthState(response: any): void {
    const token = response?.token;
    const user = response?.user;

    if (token) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
      }
      this.tokenSubject.next(token);
    }

    if (user) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentUser', JSON.stringify(user));
      }
      this.currentUserSubject.next(user);
    }
  }
}