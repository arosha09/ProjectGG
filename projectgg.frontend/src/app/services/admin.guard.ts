import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    const user = this.auth.getCurrentUser();
    const isAdmin = user?.role === 'admin' || user?.is_admin === true;
    if (!isAdmin) {
      this.router.navigate(['/dashboard']);
      return false;
    }

    return true;
  }
}
