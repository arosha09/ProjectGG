import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';
import { CyberDatePickerComponent } from '../../components/cyber-date-picker/cyber-date-picker.component';
import { CyberSelectComponent, CyberSelectOption } from '../../components/cyber-select/cyber-select.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StatusMessageComponent, CyberDatePickerComponent, CyberSelectComponent, MatIconModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  name = '';
  username = '';
  email = '';
  dateOfBirth = '';
  gender = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';
  showPassword = false;
  showConfirmPassword = false;

  readonly genderOptions: CyberSelectOption[] = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'PN', label: 'Prefer not to say' },
  ];

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  submit(): void {
    if (!this.name || !this.username || !this.email || !this.dateOfBirth || !this.password || !this.confirmPassword) {
      this.error = 'All fields are required.';
      this.cdr.detectChanges();
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    const dob = new Date(this.dateOfBirth + 'T00:00:00');

    this.auth.register(this.name, this.username, this.email, this.password, dob, this.gender).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err: any) => {
        this.loading = false;
        const message = err?.error?.message ?? '';
        if (message.includes('username') || message.includes('taken') || message.includes('exists')) {
          this.error = 'GAMERTAG TAKEN — That username is already claimed.';
        } else if (message.includes('email') || message.includes('already')) {
          this.error = 'EMAIL REGISTERED — This email is already in use.';
        } else if (message.includes('duplicate')) {
          this.error = 'DUPLICATE ENTRY — Username or email already exists.';
        } else {
          this.error = message || 'SYSTEM ERROR — Registration failed. Try again.';
        }
        this.cdr.detectChanges();
      },
      complete: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
