import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UsersService } from './users.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly usersService = inject(UsersService);

  get currentUser$() {
    return this.usersService.currentUser$;
  }

  get token$() {
    return this.usersService.token$;
  }

  register(name: string, username: string, email: string, password: string, date_of_birth: Date, gender: string): Observable<any> {
    return this.usersService.register({
      name,
      username,
      email,
      password_hash: password,
      date_of_birth,
      gender,
    });
  }

  login(email: string, password: string): Observable<any> {
    return this.usersService.login({ email, password });
  }

  refreshToken(): Observable<any> {
    return this.usersService.refreshToken();
  }

  logout(): void {
    this.usersService.logout();
  }

  isAuthenticated(): boolean {
    return this.usersService.isAuthenticated();
  }

  getToken(): string | null {
    return this.usersService.getToken();
  }

  getCurrentUser(): any {
    return this.usersService.getCurrentUser();
  }
}
