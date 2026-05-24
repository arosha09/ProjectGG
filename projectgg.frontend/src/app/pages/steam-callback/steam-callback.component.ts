import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-steam-callback',
  standalone: true,
  template: `
    <div class="steam-callback-shell">
      <div class="scb-card">
        <div class="scb-spinner"></div>
        <p>{{ status }}</p>
      </div>
    </div>
  `,
  styles: [`
    .steam-callback-shell {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #0a0e27; color: #e9f9f3;
      font-family: 'Inter', sans-serif;
    }
    .scb-card {
      text-align: center;
      padding: 40px; border-radius: 8px;
      background: rgba(255,255,255,.02);
      border: 1px solid rgba(255,255,255,.04);
    }
    .scb-spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(0,255,153,.15);
      border-top-color: #00ff99;
      border-radius: 50%;
      animation: scb-spin .7s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes scb-spin { to { transform: rotate(360deg); } }
    p { margin: 0; font-size: 14px; color: rgba(230,255,240,.6); }
  `]
})
export class SteamCallbackComponent implements OnInit {
  status = 'Processing Steam login...';
  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const state = params['state'] ?? '';
      // Collect all openid.* params
      const openidParams: Record<string, string> = {};
      for (const key of Object.keys(params)) {
        if (key.startsWith('openid.') || key === 'openid_ns') {
          // Handle potential dot encoding issues
          const actualKey = key.replace(/_/g, '.');
          if (actualKey !== 'state') {
            openidParams[actualKey] = params[key];
          }
        }
      }

      if (!state || Object.keys(openidParams).length === 0) {
        this.status = 'Invalid Steam response. Redirecting...';
        setTimeout(() => this.router.navigate(['/settings']), 2000);
        return;
      }

      this.http.post(`${this.apiUrl}/platform/steam/validate`, { state, openidParams }).subscribe({
        next: () => {
          this.status = 'Steam connected! Redirecting...';
          setTimeout(() => this.router.navigate(['/settings'], { queryParams: { platform: 'steam', connected: 'true' } }), 1000);
        },
        error: (err) => {
          this.status = `Failed: ${err.error?.message || err.message}. Redirecting...`;
          setTimeout(() => this.router.navigate(['/settings'], { queryParams: { platform: 'steam', error: encodeURIComponent(err.error?.message || err.message) } }), 2000);
        },
      });
    });
  }
}
