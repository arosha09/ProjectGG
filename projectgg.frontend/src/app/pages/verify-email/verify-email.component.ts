import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StatusMessageComponent } from '../../components/status-message/status-message.component';
import { UsersService } from '../../services/users.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, StatusMessageComponent],
  template: `
    <section class="verify-shell">
      <div class="verify-card">
        @if (verifying) {
          <div class="verify-spinner"></div>
          <h2>Verifying...</h2>
        } @else if (success) {
          <mat-icon class="verify-icon success">check_circle</mat-icon>
          <h2>Email Verified</h2>
          <p>Your email has been successfully verified.</p>
          <a class="verify-btn" routerLink="/settings">Go to Settings</a>
        } @else if (showInput) {
          <mat-icon class="verify-icon input-icon">vpn_key</mat-icon>
          <h2>Enter Verification Code</h2>
          <p>Check your email for the 6-character code.</p>
          <div class="code-input-wrap">
            <input class="code-input" type="text" [(ngModel)]="codeInput" maxlength="6" placeholder="XXXXXX" (keyup.enter)="submitCode()" (input)="onCodeInput()" autocomplete="off" />
          </div>
          <button class="verify-btn" (click)="submitCode()" [disabled]="codeInput.length !== 6 || submitting">
            @if (submitting) { VERIFYING... } @else { VERIFY }
          </button>
          @if (errorMessage) {
            <app-status-message type="error" [message]="errorMessage" />
          }
          <a class="verify-btn" routerLink="/settings" style="margin-top:12px;font-size:11px;opacity:.6;">Back to Settings</a>
        } @else {
          <mat-icon class="verify-icon error">cancel</mat-icon>
          <h2>Verification Failed</h2>
          <app-status-message type="error" [message]="errorMessage || 'Invalid or expired verification code.'" />
          <a class="verify-btn" routerLink="/settings">Back to Settings</a>
        }
      </div>
    </section>
  `,
  styles: [`
    .verify-shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #050a18;
      padding: 24px;
    }
    .verify-card {
      text-align: center;
      padding: 48px 40px;
      background: linear-gradient(180deg, rgba(4,10,22,.95), rgba(6,15,30,.8));
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 10px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 0 40px rgba(0,0,0,.5);
    }
    .verify-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255,215,0,.15);
      border-top-color: #ffd700;
      border-radius: 50%;
      animation: spin .6s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .verify-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }
    .verify-icon.success { color: #00e676; }
    .verify-icon.error { color: #ff2255; }
    .verify-icon.input-icon { color: #64b5f6; }
    h2 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #e9f9f3;
      margin: 0 0 12px;
    }
    p {
      font-size: 14px;
      color: rgba(230,255,240,.6);
      margin: 0 0 24px;
    }
    .code-input-wrap {
      margin: 0 auto 20px;
      max-width: 200px;
    }
    .code-input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(0,0,0,.4);
      border: 1px solid rgba(255,215,0,.25);
      border-radius: 8px;
      color: #ffd700;
      font-family: 'SF Mono','Fira Code','Courier New',monospace;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 8px;
      text-align: center;
      text-transform: uppercase;
      outline: none;
      box-sizing: border-box;
      transition: border-color .2s, box-shadow .2s;
    }
    .code-input:focus {
      border-color: #ffd700;
      box-shadow: 0 0 20px rgba(255,215,0,.15);
    }
    .verify-btn {
      display: inline-flex;
      padding: 12px 28px;
      border: 1px solid #ffd700;
      background: transparent;
      color: #ffd700;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      border-radius: 6px;
      cursor: pointer;
      transition: background .2s, box-shadow .2s;
    }
    .verify-btn:hover:not(:disabled) {
      background: rgba(255,215,0,.1);
      box-shadow: 0 0 16px rgba(255,215,0,.2);
    }
    .verify-btn:disabled {
      opacity: .4;
      cursor: not-allowed;
    }
  `]
})
export class VerifyEmailComponent implements OnInit {
  verifying = true;
  success = false;
  showInput = false;
  errorMessage = '';
  codeInput = '';
  submitting = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly usersService: UsersService,
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.verifying = false;
      this.showInput = true;
      return;
    }

    this.verify(token);
  }

  onCodeInput(): void {
    this.codeInput = this.codeInput.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    this.errorMessage = '';
  }

  submitCode(): void {
    if (this.codeInput.length !== 6 || this.submitting) return;
    this.submitting = true;
    this.errorMessage = '';
    this.verify(this.codeInput);
  }

  private verify(code: string): void {
    this.http.post<{ message: string }>(`${environment.apiUrl}/auth/verify-email`, { code }).subscribe({
      next: () => {
        this.success = true;
        this.verifying = false;
        this.submitting = false;
        const user = this.usersService.getCurrentUser();
        if (user) {
          this.usersService.updateCurrentUser({ ...user, email_verified: true });
        }
      },
      error: (err) => {
        this.verifying = false;
        this.success = false;
        this.showInput = false;
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Verification failed.';
      },
    });
  }
}
