import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TimeoutError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';
import { MatIconModule } from '@angular/material/icon';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';
import { CyberDatePickerComponent } from '../../components/cyber-date-picker/cyber-date-picker.component';
import { CyberSelectComponent, CyberSelectOption } from '../../components/cyber-select/cyber-select.component';

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  successMessage = '';
  showPassword = false;
  showConfirmPassword = false;
  verificationCode = '';
  verificationError = '';
  verifyingEmail = false;
  private readonly verificationDialog = viewChild.required<ElementRef<HTMLDialogElement>>('verificationDialog');

  readonly genderOptions: CyberSelectOption[] = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'PN', label: 'Prefer not to say' },
  ];

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  submit(): void {
    if (this.loading || this.successMessage) return;

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
        this.loading = false;
        this.successMessage = 'INITIALIZATION SUCCESSFUL';
        this.cdr.detectChanges();
        this.verificationDialog().nativeElement.showModal();
      },
      error: (err: any) => {
        this.loading = false;
        const message = err?.error?.message ?? '';
        if (err instanceof TimeoutError) {
          this.error = 'Registration took too long. Try signing in before submitting again.';
        } else if (message.includes('username') || message.includes('taken') || message.includes('exists')) {
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
    });
  }

  verifyEmail(): void {
    const code = this.verificationCode.trim().toUpperCase();
    if (this.verifyingEmail || !/^[A-Z0-9]{6}$/.test(code)) return;

    this.verifyingEmail = true;
    this.verificationError = '';
    this.users.verifyEmail(code).subscribe({
      next: () => {
        this.verifyingEmail = false;
        this.cdr.markForCheck();
        this.continueToDashboard();
      },
      error: (err) => {
        this.verifyingEmail = false;
        this.verificationError = err?.error?.message || 'Could not verify your email. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  continueToDashboard(event?: Event): void {
    event?.preventDefault();
    if (!this.verifyingEmail) void this.router.navigate(['/dashboard']);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
