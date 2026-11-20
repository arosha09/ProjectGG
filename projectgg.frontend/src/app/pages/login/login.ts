import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, StatusMessageComponent, MatIconModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
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
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const expired = this.route.snapshot.queryParams['session_expired'];
    if (expired === 'true') {
      this.error = 'SESSION EXPIRED — Your session has timed out. Please log in again to continue.';
      this.cdr.detectChanges();
    } else if (expired === 'no_refresh') {
      this.error = 'PLEASE SIGN IN — Your saved session needs to be refreshed. Sign in to create a persistent session.';
      this.cdr.detectChanges();
    } else if (expired === 'no_data') {
      this.error = 'SESSION ERROR — Your profile data is incomplete. Please sign in to restore your session.';
      this.cdr.detectChanges();
    }
  }

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
        const status = err?.status;
        const backendMsg = err?.error?.message || err?.message || '';
        if (status === 401 || /invalid credentials|wrong credentials|unauthorized/i.test(backendMsg)) {
          this.error = 'INVALID CREDENTIALS — Wrong email or password. Please try again.';
        } else if (status === 429) {
          this.error = 'TOO MANY ATTEMPTS — Please wait a moment before trying again.';
        } else if (backendMsg) {
          this.error = `LOGIN ERROR — ${backendMsg}`;
        } else {
          this.error = 'SYSTEM ERROR — Login failed. Try again.';
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
