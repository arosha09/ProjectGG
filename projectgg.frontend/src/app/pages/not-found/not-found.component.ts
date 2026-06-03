import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="cyber-404">
      <div class="cyber-404-glitch" data-text="404">404</div>
      <p class="cyber-404-sub">RESOURCE NOT FOUND</p>
      <p class="cyber-404-desc">The requested endpoint does not exist or is unavailable.</p>
      <button class="cyber-404-btn" (click)="goHome()">RETURN TO BASE</button>
      <div class="cyber-404-scanlines"></div>
    </section>
  `,
  styles: [`
    .cyber-404 {
      position: fixed; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: var(--bg-black); color: var(--text-primary);
      font-family: var(--font-mono, 'Courier New', monospace);
      z-index: 9999;
      gap: 16px;
    }
    .cyber-404-glitch {
      font-size: 120px; font-weight: 900;
      color: var(--color-primary);
      text-shadow: 4px 0 var(--neon-red), -4px 0 var(--neon-blue);
      position: relative;
      animation: gg-404-glitch 2s steps(1) infinite;
      letter-spacing: 12px;
    }
    .cyber-404-glitch::before,
    .cyber-404-glitch::after {
      content: attr(data-text);
      position: absolute; inset: 0;
      opacity: 0.8;
    }
    .cyber-404-glitch::before {
      animation: gg-404-shift 3s infinite linear alternate-reverse;
      color: var(--neon-red);
      clip-path: inset(20% 0 60% 0);
    }
    .cyber-404-glitch::after {
      animation: gg-404-shift 2s infinite linear alternate;
      color: var(--neon-blue);
      clip-path: inset(60% 0 10% 0);
    }
    @keyframes gg-404-glitch {
      0%, 95%, 100% { transform: skew(0deg, 0deg); opacity: 1; }
      96% { transform: skew(-3deg, 1deg); opacity: 0.85; }
      97% { transform: skew(3deg, -1deg); opacity: 0.9; }
      98% { transform: skew(-2deg, 0deg); opacity: 0.8; }
    }
    @keyframes gg-404-shift {
      0% { transform: translate(0); }
      25% { transform: translate(-3px, 1px); }
      50% { transform: translate(2px, -1px); }
      75% { transform: translate(-1px, 2px); }
      100% { transform: translate(3px, -2px); }
    }
    .cyber-404-sub {
      font-size: 18px; font-weight: 700; letter-spacing: 6px;
      color: var(--neon-red); margin: 0;
    }
    .cyber-404-desc {
      font-size: 14px; color: var(--text-muted); margin: 0;
      max-width: 400px; text-align: center;
    }
    .cyber-404-btn {
      margin-top: 8px; padding: 12px 32px;
      background: transparent; border: 1.5px solid var(--color-primary);
      color: var(--color-primary); font-size: 14px; font-weight: 700;
      letter-spacing: 3px; cursor: pointer; transition: all .2s;
      text-transform: uppercase;
    }
    .cyber-404-btn:hover {
      background: var(--color-primary); color: var(--bg-black);
      box-shadow: 0 0 24px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.4);
    }
    .cyber-404-scanlines {
      position: fixed; inset: 0; pointer-events: none;
      background: repeating-linear-gradient(
        0deg, transparent, transparent 2px,
        rgba(0, 0, 0, 0.15) 2px, rgba(0, 0, 0, 0.15) 4px
      );
    }
  `]
})
export class NotFoundComponent {
  private readonly router = inject(Router);

  goHome(): void {
    this.router.navigate(['/']);
  }
}
