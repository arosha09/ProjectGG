import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StatusMessageComponent, MatIconModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';
  loading = false;
  error = '';
  successMessage = '';
  showPassword = false;
  showAdminChoice = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  submit(): void {
    if (!this.email || !this.password) {
      this.error = 'Complete the fields to enter the arena.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'AUTHORIZED';
        this.cdr.detectChanges();
        setTimeout(() => {
          const user = this.auth.getCurrentUser();
          if (user?.role === 'admin') {
            this.showAdminChoice = true;
          } else {
            this.router.navigate(['/dashboard']);
          }
          this.cdr.detectChanges();
        }, 2000);
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'UNAUTHORIZED — Wrong credentials. Check your email and password and try again.';
        } else {
          this.error = err.error?.message || 'SYSTEM ERROR — Login failed. Try again.';
        }
        this.cdr.detectChanges();
      },
      complete: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  goToDashboard(): void {
    this.showAdminChoice = false;
    this.router.navigate(['/dashboard']);
  }

  goToAdmin(): void {
    this.showAdminChoice = false;
    this.router.navigate(['/admin']);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }
}
