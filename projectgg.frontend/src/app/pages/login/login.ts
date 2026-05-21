import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';
  loading = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit(): void {
    if (!this.email || !this.password) {
      this.error = 'Complete the fields to enter the arena.';
      return;
    }

    this.loading = true;
    this.error = '';

    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message ?? 'Login failed.';
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
