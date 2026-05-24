import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-discord-callback',
  standalone: true,
  template: `
    <div class="discord-callback-shell">
      <div class="dcb-card">
        <div class="dcb-spinner"></div>
        <p>{{ status }}</p>
      </div>
    </div>
  `,
  styles: [`
    .discord-callback-shell {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #0a0e27; color: #e9f9f3;
      font-family: 'Inter', sans-serif;
    }
    .dcb-card {
      text-align: center;
      padding: 40px; border-radius: 8px;
      background: rgba(255,255,255,.02);
      border: 1px solid rgba(255,255,255,.04);
    }
    .dcb-spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(88,101,242,.15);
      border-top-color: #5865f2;
      border-radius: 50%;
      animation: dcb-spin .7s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes dcb-spin { to { transform: rotate(360deg); } }
    p { margin: 0; font-size: 14px; color: rgba(230,255,240,.6); }
  `]
})
export class DiscordCallbackComponent implements OnInit {
  status = 'Processing Discord connection...';
  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const code = params['code'] ?? '';
      const state = params['state'] ?? '';

      if (!code || !state) {
        this.status = 'Invalid Discord response. Redirecting...';
        setTimeout(() => this.router.navigate(['/settings']), 2000);
        return;
      }

      this.http.post(`${this.apiUrl}/platform/discord/validate`, { code, state }).subscribe({
        next: () => {
          this.status = 'Discord connected! Redirecting...';
          setTimeout(() => this.router.navigate(['/settings'], { queryParams: { platform: 'discord', connected: 'true' } }), 1000);
        },
        error: (err) => {
          this.status = `Failed: ${err.error?.message || err.message}. Redirecting...`;
          setTimeout(() => this.router.navigate(['/settings'], { queryParams: { platform: 'discord', error: encodeURIComponent(err.error?.message || err.message) } }), 2000);
        },
      });
    });
  }
}
