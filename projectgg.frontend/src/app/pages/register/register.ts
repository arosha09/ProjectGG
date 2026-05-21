import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  name = '';
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit(): void {
    if (!this.name || !this.username || !this.email || !this.password || !this.confirmPassword) {
      this.error = 'All fields are required.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    this.error = '';

    this.auth.register(this.name, this.username, this.email, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message ?? 'Registration failed.';
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
