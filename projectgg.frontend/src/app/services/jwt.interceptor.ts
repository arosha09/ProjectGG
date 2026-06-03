import { Injectable, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);
  private readonly router = inject(Router);

  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authService.getToken();

    if (token) {
      request = this.addToken(request, token);
    }

    return next.handle(request).pipe(
      catchError((error) => {
        if (error instanceof HttpErrorResponse) {
          if (error.status === 401 && !request.url.includes('/auth/refresh')) {
            return this.handle401Error(request, next);
          }
          if (error.status === 404) {
            return throwError(() => error);
          }
          if (error.status === 0) {
            console.warn('[JwtInterceptor] Network error — logging out');
            this.authService.logout();
            this.router.navigate(['/login'], { queryParams: { disconnected: 'true' } });
            return throwError(() => error);
          }
        }
        return throwError(() => error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      if (!this.authService.getRefreshToken()) {
        console.warn('[JwtInterceptor] No refresh token available, redirecting to login');
        this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { session_expired: 'no_refresh' } });
        return throwError(() => new Error('No refresh token'));
      }

      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);
      console.warn('[JwtInterceptor] Token expired, attempting refresh...');

      return this.authService.refreshToken().pipe(
        switchMap((response: any) => {
          this.isRefreshing = false;
          const token = response?.token;
          if (token) {
            console.warn('[JwtInterceptor] Refresh succeeded, retrying request');
            this.refreshTokenSubject.next(token);
            return next.handle(this.addToken(request, token));
          }
          console.warn('[JwtInterceptor] Refresh failed - no token in response');
          this.authService.logout();
          this.router.navigate(['/login'], { queryParams: { session_expired: 'true' } });
          return throwError(() => new Error('Refresh failed'));
        }),
        catchError((err) => {
          console.warn('[JwtInterceptor] Refresh error:', err);
          this.isRefreshing = false;
          this.authService.logout();
          this.router.navigate(['/login'], { queryParams: { session_expired: 'true' } });
          return throwError(() => err);
        })
      );
    }

    return this.refreshTokenSubject.pipe(
      filter((token) => token !== null),
      take(1),
      switchMap((token) => next.handle(this.addToken(request, token!)))
    );
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
}