import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ChatService, DrawCard, DrawResult } from '../../services/chat.service';

@Component({
  selector: 'app-card-draw',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <ng-container *ngIf="state === 'reeling'">
      <div class="reel-overlay">
        <div class="reel-ambient reel-ambient-a"></div>
        <div class="reel-ambient reel-ambient-b"></div>

        <div class="reel-hud">
          <span class="hud-tag">NEURAL JACKPOT</span>
          <span class="hud-sub" [class.fading]="isTransitioning">
            {{ loadingData ? currentLoadingMessage : 'spinning the vault...' }}
          </span>
        </div>

        <!-- LOADING PHASE: animated messages, NO images -->
        <div class="reel-loading" *ngIf="loadingData">
          <div class="reel-loading-ring"></div>
          <div class="reel-loading-ring reel-loading-ring-2"></div>
          <div class="reel-loading-core">
            <mat-icon class="reel-loading-icon">memory</mat-icon>
            <div class="reel-loading-progress">
              <div class="reel-loading-bar"></div>
            </div>
            <div class="reel-loading-percent">{{ loadingPercent }}%</div>
          </div>
        </div>

        <!-- REEL PHASE: actual spinning cards with images -->
        <div class="reel-stage" *ngIf="!loadingData">
          <div class="reel-container">
            <div class="reel-scanlines"></div>
            <div class="reel-track" [class.fast]="reelPhase === 'fast'" [class.slow]="reelPhase === 'slow'" [class.stop]="reelPhase === 'stop'" [style.transform]="'translateX(' + reelOffsetPx + 'px)'">
              <ng-container *ngFor="let card of reelCards; let i = index">
                <div class="reel-card" [class.highlight]="i === highlightIndex">
                  <div class="reel-card-inner" [class]="'tier-' + card.card_tier">
                    <ng-container *ngIf="card.cover_url; else noCoverReel">
                      <img [src]="card.cover_url" alt="" class="reel-card-img" (error)="onImgError($event)" />
                    </ng-container>
                    <ng-template #noCoverReel>
                      <div class="reel-card-placeholder">
                        <span class="placeholder-icon">🎮</span>
                        <span class="placeholder-tier">{{ card.card_tier | uppercase }}</span>
                      </div>
                    </ng-template>
                  </div>
                </div>
              </ng-container>
              <div class="reel-card-glow"></div>
            </div>
            <div class="reel-pointer"></div>
          </div>
        </div>
      </div>
    </ng-container>

    <ng-container *ngIf="state === 'result' && resultCard">
      <div class="result-overlay" (click)="closeResult()">
        <div class="result-shell" (click)="$event.stopPropagation()">
          <div class="result-frame" [style.border-color]="tierColor(resultCard.card_tier)" [style.box-shadow]="tierGlow(resultCard.card_tier)">
            <div class="result-header">
              <div>
                <span class="result-kicker">DRAW COMPLETE</span>
                <h3>{{ resultCard.game_name }}</h3>
              </div>
              <div class="result-tier-badge" [style.background]="tierColor(resultCard.card_tier)">
                {{ resultCard.card_tier | uppercase }}
              </div>
            </div>

            <div class="result-body">
              <div class="result-art">
                <ng-container *ngIf="resultCard.cover_url; else noCoverResult">
                  <img [src]="resultCard.cover_url" alt="" class="result-img" (error)="onImgError($event)" />
                </ng-container>
                <ng-template #noCoverResult>
                  <div class="result-placeholder">
                    <span class="placeholder-icon-lg">🎮</span>
                    <span class="placeholder-tier-lg">{{ resultCard.card_tier | uppercase }}</span>
                  </div>
                </ng-template>
                <div class="result-scan-line"></div>
                <div class="result-bloom"></div>
              </div>

              <div class="result-meta">
                <div class="result-chip-row">
                  <span class="result-chip">RATING {{ resultCard.rating || '—' }}</span>
                  <span class="result-chip" *ngIf="resultCard.release_year">{{ resultCard.release_year }}</span>
                  <span class="result-chip" *ngIf="resultCard.series_name">{{ resultCard.series_name }}</span>
                </div>

                <p class="result-desc" *ngIf="resultCard.desc">{{ resultCard.desc }}</p>

                <div class="result-xp" [class.new-card]="isNew">
                  <ng-container *ngIf="isNew; else duplicateXP">
                    <mat-icon>auto_awesome</mat-icon>
                    <span>+{{ xpAwarded }} XP • NEW ACQUISITION</span>
                  </ng-container>
                  <ng-template #duplicateXP>
                    <mat-icon>repeat</mat-icon>
                    <span>+{{ xpAwarded }} XP • DUPLICATE CONVERTED</span>
                  </ng-template>
                </div>

                <div class="result-details">
                  <span *ngIf="resultCard.source">source: {{ resultCard.source | uppercase }}</span>
                  <span>added to arsenal on close</span>
                </div>
              </div>
            </div>

            <div class="result-footer">TAP ANYWHERE TO RETURN</div>
          </div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }

    /* ── REEL OVERLAY ── */
    .reel-overlay {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at center, rgba(255, 45, 111, 0.12), transparent 32%), rgba(5, 6, 12, 0.96);
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      overflow: hidden;
    }

    .reel-ambient {
      position: absolute;
      inset: auto;
      width: 480px;
      height: 480px;
      border-radius: 50%;
      filter: blur(30px);
      opacity: 0.35;
      animation: ambient-pulse 4s ease-in-out infinite;
    }

    .reel-ambient-a {
      left: -120px;
      top: -140px;
      background: rgba(255, 45, 111, 0.45);
    }

    .reel-ambient-b {
      right: -140px;
      bottom: -160px;
      background: rgba(0, 230, 255, 0.24);
      animation-delay: 1.4s;
    }

    @keyframes ambient-pulse {
      0%, 100% { transform: scale(0.95); opacity: 0.25; }
      50% { transform: scale(1.08); opacity: 0.45; }
    }

    .reel-hud {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-bottom: 28px;
      z-index: 2;
    }

    .hud-tag {
      letter-spacing: 4px;
      font-size: 12px;
      font-weight: 900;
      color: #ff4d84;
      text-shadow: 0 0 20px rgba(255, 45, 111, 0.65);
    }

    .hud-sub {
      font-size: 12px;
      color: rgba(240, 246, 255, 0.55);
      letter-spacing: 2px;
      min-height: 18px;
      transition: opacity 0.3s;
    }

    .hud-sub.fading { opacity: 0; }

    /* ── LOADING PHASE (no images) ── */
    .reel-loading {
      position: relative;
      width: 280px;
      height: 280px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }

    .reel-loading-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: #ff2d6f;
      border-right-color: rgba(255, 45, 111, 0.5);
      animation: spin-cw 1.2s linear infinite;
    }

    .reel-loading-ring-2 {
      inset: 24px;
      border-top-color: #5bd9ff;
      border-left-color: rgba(91, 217, 255, 0.4);
      animation: spin-ccw 1.6s linear infinite;
    }

    @keyframes spin-cw { to { transform: rotate(360deg); } }
    @keyframes spin-ccw { to { transform: rotate(-360deg); } }

    .reel-loading-core {
      position: relative;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle at center, rgba(255, 45, 111, 0.18), rgba(8, 9, 18, 0.95) 70%);
      border: 1.5px solid rgba(255, 45, 111, 0.45);
      box-shadow: 0 0 32px rgba(255, 45, 111, 0.25), inset 0 0 18px rgba(255, 45, 111, 0.18);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .reel-loading-icon {
      font-size: 38px !important;
      width: 38px !important;
      height: 38px !important;
      color: #ff5f8e;
      filter: drop-shadow(0 0 12px rgba(255, 45, 111, 0.8));
      animation: icon-flicker 0.8s ease-in-out infinite alternate;
    }

    @keyframes icon-flicker {
      from { opacity: 0.75; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1.04); }
    }

    .reel-loading-progress {
      width: 80px;
      height: 3px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
      position: relative;
    }

    .reel-loading-bar {
      height: 100%;
      background: linear-gradient(90deg, #ff2d6f, #5bd9ff);
      box-shadow: 0 0 8px rgba(255, 45, 111, 0.6);
      transition: width 0.2s;
      animation: bar-shimmer 1.4s ease-in-out infinite;
    }

    @keyframes bar-shimmer {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.4); }
    }

    .reel-loading-percent {
      font-size: 10px;
      font-weight: 800;
      color: #ff5f8e;
      letter-spacing: 2px;
      font-family: 'Courier New', monospace;
    }

    /* ── REEL STAGE (cards with images) ── */
    .reel-stage {
      width: 100%;
      max-width: 880px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      animation: stage-in 0.4s ease-out;
    }

    @keyframes stage-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    .reel-container {
      position: relative;
      width: 100%;
      height: 220px;
      overflow: hidden;
      border-top: 1px solid rgba(255, 45, 111, 0.45);
      border-bottom: 1px solid rgba(255, 45, 111, 0.45);
      background: linear-gradient(180deg, rgba(11, 12, 22, 0.85), rgba(8, 9, 18, 0.96));
      box-shadow: inset 0 0 60px rgba(255, 45, 111, 0.09), 0 0 40px rgba(0, 0, 0, 0.5);
    }

    .reel-track {
      display: flex;
      gap: 16px;
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      align-items: center;
      transition: transform 3.2s cubic-bezier(0.14, 0.84, 0.16, 1);
      will-change: transform;
    }

    .reel-track.fast { filter: saturate(1.1); }

    .reel-track.stop {
      transition: transform 0.8s cubic-bezier(0.08, 0.74, 0.08, 1);
    }

    .reel-card {
      flex-shrink: 0;
      width: 140px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px 0;
    }

    .reel-card-inner {
      width: 110px;
      height: 150px;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s;
      background: var(--bg-dark);
    }

    .tier-common { border-color: #8c96a8 !important; box-shadow: 0 0 10px #8c96a844; }
    .tier-uncommon { border-color: #00e676 !important; box-shadow: 0 0 10px #00e67644; }
    .tier-rare { border-color: #5fb6ff !important; box-shadow: 0 0 10px #5fb6ff44; }
    .tier-epic { border-color: #aa44ff !important; box-shadow: 0 0 10px #aa44ff44; }
    .tier-legendary {
      border-color: #ffd700 !important;
      box-shadow: 0 0 20px rgba(255,215,0,.6);
      animation: border-glow 2s ease-in-out infinite;
    }
    @keyframes border-glow { 0%, 100% { box-shadow: 0 0 15px rgba(255,215,0,.4); } 50% { box-shadow: 0 0 25px rgba(255,215,0,1); } }

    .reel-card.highlight .reel-card-inner {
      transform: scale(1.16);
      border-width: 2px;
      z-index: 10;
    }

    .reel-card-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .reel-card-glow {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 0%, transparent 55%, rgba(255, 255, 255, 0.08) 100%);
      pointer-events: none;
      mix-blend-mode: screen;
    }

    .reel-card-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top, rgba(255, 45, 111, 0.10), transparent 48%), rgba(6, 8, 18, 1);
      border: 1px solid;
      gap: 4px;
    }

    .placeholder-icon { font-size: 28px; }
    .placeholder-tier {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 2px;
      color: var(--text-muted);
    }

    .reel-pointer {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 100%;
      background: linear-gradient(180deg, transparent, #ff2d6f 15%, #5bd9ff 50%, #ff2d6f 85%, transparent);
      box-shadow: 0 0 18px rgba(255, 45, 111, 0.85);
      z-index: 20;
    }

    .reel-pointer::before,
    .reel-pointer::after {
      content: '';
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
    }

    .reel-pointer::before {
      top: -8px;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid #ff2d6f;
    }

    .reel-pointer::after {
      bottom: -8px;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 8px solid #5bd9ff;
    }

    .reel-scanlines {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.06), transparent 18%, transparent 82%, rgba(255,255,255,0.04));
      pointer-events: none;
      opacity: 0.55;
    }

    /* ── RESULT ── */
    .result-overlay {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at center, rgba(255, 45, 111, 0.14), transparent 30%), rgba(5, 6, 12, 0.94);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      cursor: pointer;
    }

    .result-shell {
      width: min(94vw, 760px);
    }

    .result-frame {
      position: relative;
      overflow: hidden;
      background: linear-gradient(180deg, rgba(10, 11, 20, 0.98), rgba(6, 7, 14, 0.98));
      border: 1px solid;
      border-radius: 18px;
      padding: 22px;
      animation: result-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes result-pop {
      from { transform: scale(0.5); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .result-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;

      h3 {
        margin: 4px 0 0;
        font-size: 24px;
        color: #f2f6ff;
      }
    }

    .result-kicker {
      font-size: 11px;
      letter-spacing: 4px;
      color: #ff2d6f;
      font-weight: 900;
    }

    .result-tier-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 14px;
      border-radius: 999px;
      color: #fff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 3px;
      box-shadow: 0 0 18px rgba(255, 45, 111, 0.26);
    }

    .result-body {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 18px;
      align-items: start;
    }

    .result-art {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 22;
      border-radius: 14px;
      overflow: hidden;
      background: rgba(4, 6, 12, 1);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .result-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .result-placeholder {
      width: 100%;
      height: 100%;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top, rgba(255, 45, 111, 0.10), transparent 42%), rgba(4, 6, 12, 1);
      gap: 8px;
    }

    .placeholder-icon-lg { font-size: 48px; }
    .placeholder-tier-lg {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 3px;
      color: var(--text-muted);
    }

    .result-scan-line {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(90deg, transparent, rgba(255, 45, 111, 0.9), rgba(91, 217, 255, 0.9), transparent);
      animation: scan 2s linear infinite;
      box-shadow: 0 0 18px rgba(255, 45, 111, 0.8);
    }

    @keyframes scan {
      from { top: -3px; }
      to { top: 100%; }
    }

    .result-bloom {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, transparent 30%, rgba(255, 45, 111, 0.12) 100%);
      pointer-events: none;
    }

    .result-meta {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-top: 6px;
    }

    .result-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .result-chip {
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: rgba(241, 247, 255, 0.8);
      font-size: 11px;
      letter-spacing: 1.5px;
    }

    .result-desc {
      margin: 0;
      color: rgba(241, 247, 255, 0.7);
      font-size: 13px;
      line-height: 1.65;
      max-height: 220px;
      overflow: auto;
      padding-right: 4px;
    }

    .result-xp {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      padding: 12px 14px;
      background: linear-gradient(135deg, rgba(255, 45, 111, 0.14), rgba(91, 217, 255, 0.08));
      border-radius: 10px;
      color: #ff5f8e;
      font-weight: 800;
      font-size: 14px;
      border: 1px solid rgba(255, 45, 111, 0.22);
    }

    .result-xp.new-card { animation: xp-pulse 0.75s ease-in-out infinite alternate; }

    @keyframes xp-pulse {
      from { box-shadow: none; transform: translateY(0); }
      to { box-shadow: 0 0 26px rgba(255, 45, 111, 0.32); transform: translateY(-1px); }
    }

    .result-xp mat-icon { font-size: 20px; width: 20px; height: 20px; }

    .result-details {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: rgba(241, 247, 255, 0.45);
      font-size: 11px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    .result-footer {
      margin-top: 18px;
      text-align: center;
      font-size: 11px;
      letter-spacing: 4px;
      color: rgba(241, 247, 255, 0.45);
    }

    @media (max-width: 780px) {
      .reel-container { height: 196px; }
      .result-body { grid-template-columns: 1fr; }
      .result-art { max-width: 280px; margin: 0 auto; }
      .result-header h3 { font-size: 20px; }
      .reel-loading { width: 220px; height: 220px; }
      .reel-loading-core { width: 110px; height: 110px; }
    }
  `],
})
export class CardDrawComponent {
  @Input() ticketCount = 0;
  @Output() drawComplete = new EventEmitter<{ card: DrawCard; isNew: boolean; xp: number }>();

  state: 'idle' | 'reeling' | 'result' = 'idle';
  reelPhase: 'fast' | 'slow' | 'stop' = 'fast';
  reelCards: DrawCard[] = [];
  highlightIndex = 15;
  reelOffsetPx = 0;
  resultCard: DrawCard | null = null;
  isNew = false;
  xpAwarded = 0;
  defaultCover = '';
  loadingData = false;
  loadingPercent = 0;
  isTransitioning = false;
  currentLoadingMessage = 'initializing neural link...';

  private reelTimers: ReturnType<typeof setTimeout>[] = [];
  private loadingTimers: ReturnType<typeof setTimeout>[] = [];
  private percentInterval: ReturnType<typeof setInterval> | null = null;

  private readonly loadingMessages = [
    'initializing neural link...',
    'authenticating operator...',
    'syncing with vault...',
    'decrypting prize stream...',
    'stabilizing quantum state...',
    'aligning card frequencies...',
    'sealing the outcome...',
  ];

  readonly tierColors: Record<string, string> = {
    common: '#8c96a8',
    uncommon: '#00e676',
    rare: '#5fb6ff',
    epic: '#aa44ff',
    legendary: '#ffd700',
  };

  constructor(private chatService: ChatService) {}

  tierColor(tier: string): string {
    return this.tierColors[tier] || this.tierColors['common'];
  }

  tierGlow(tier: string): string {
    const c = this.tierColor(tier);
    return `0 0 30px ${c}44, 0 0 60px ${c}22`;
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      const fallback = document.createElement('div');
      fallback.className = parent.classList.contains('reel-card-inner')
        ? 'reel-card-placeholder'
        : 'result-placeholder';

      fallback.innerHTML = parent.classList.contains('reel-card-inner')
        ? '<span class="placeholder-icon">🎮</span><span class="placeholder-tier">CARD</span>'
        : '<span class="placeholder-icon-lg">🎮</span><span class="placeholder-tier-lg">CARD</span>';
      parent.appendChild(fallback);
    }
  }

  private preloadImages(urls: string[]): Promise<void> {
    const uniqueUrls = [...new Set(urls.filter(u => !!u))];
    if (uniqueUrls.length === 0) return Promise.resolve();
    return Promise.all(
      uniqueUrls.map(url => new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      }))
    ).then(() => {});
  }

  private clearTimers(): void {
    this.reelTimers.forEach(t => clearTimeout(t));
    this.reelTimers = [];
    this.loadingTimers.forEach(t => clearTimeout(t));
    this.loadingTimers = [];
    if (this.percentInterval) {
      clearInterval(this.percentInterval);
      this.percentInterval = null;
    }
  }

  private startLoadingSequence(): void {
    this.clearLoadingTimers();
    this.currentLoadingMessage = this.loadingMessages[0];
    this.loadingPercent = 0;
    this.isTransitioning = false;

    this.percentInterval = setInterval(() => {
      if (this.loadingPercent < 90) {
        const step = Math.random() * 4 + 1;
        this.loadingPercent = Math.min(90, this.loadingPercent + step);
      }
    }, 200);

    for (let i = 1; i < this.loadingMessages.length; i++) {
      this.loadingTimers.push(
        setTimeout(() => {
          this.isTransitioning = true;
          this.loadingTimers.push(
            setTimeout(() => {
              this.currentLoadingMessage = this.loadingMessages[i];
              this.isTransitioning = false;
            }, 300)
          );
        }, i * 900)
      );
    }
  }

  private finishLoading(): void {
    this.isTransitioning = true;
    if (this.percentInterval) {
      clearInterval(this.percentInterval);
      this.percentInterval = null;
    }
    let p = this.loadingPercent;
    const finishInterval = setInterval(() => {
      p = Math.min(100, p + 8);
      this.loadingPercent = p;
      if (p >= 100) {
        clearInterval(finishInterval);
      }
    }, 60);
  }

  private clearLoadingTimers(): void {
    this.loadingTimers.forEach(t => clearTimeout(t));
    this.loadingTimers = [];
  }

  skipReel(): void {
    if (this.state !== 'reeling' || !this.resultCard) return;
    this.clearTimers();
    this.reelPhase = 'stop';
    this.reelOffsetPx = this.getFinalOffset();
    this.showResult();
  }

  private showResult(): void {
    this.state = 'result';
    this.drawComplete.emit({ card: this.resultCard!, isNew: this.isNew, xp: this.xpAwarded });
  }

  private runReel(result: DrawResult): void {
    const realCard = this.normalizeResult(result);
    this.reelCards[this.highlightIndex] = realCard;
    this.resultCard = realCard;
    this.isNew = !!result.is_new;
    this.xpAwarded = result.xp_awarded ?? 0;

    const finalOffset = this.getFinalOffset();

    this.reelTimers.push(
      setTimeout(() => {
        this.reelOffsetPx = finalOffset * 0.3;
        this.reelPhase = 'slow';
      }, 3000),
      setTimeout(() => {
        this.reelOffsetPx = finalOffset;
        this.reelPhase = 'stop';
      }, 4400),
      setTimeout(() => {
        this.showResult();
      }, 5000),
    );
  }

  startDailyDraw(): void {
    this.clearTimers();
    this.state = 'reeling';
    this.reelPhase = 'fast';
    this.reelOffsetPx = 0;
    this.resultCard = null;
    this.loadingData = true;
    this.reelCards = [];
    this.startLoadingSequence();

    this.chatService.getDailyDrawCards().subscribe({
      next: (cards) => {
        const fallback = this.placeholderCard();
        this.reelCards = this.buildReelCards(cards ?? [], fallback);
        const imageUrls = (cards ?? []).map(c => c.cover_url).filter(Boolean);
        this.preloadImages(imageUrls).then(() => {
          this.finishLoading();
          setTimeout(() => {
            this.loadingData = false;
            this.chatService.claimDailyDraw().subscribe({
              next: (result: DrawResult) => {
                if (!result) { this.state = 'idle'; return; }
                this.runReel(result);
              },
              error: () => { this.state = 'idle'; },
            });
          }, 400);
        });
      },
      error: () => { this.state = 'idle'; }
    });
  }

  startTicketDraw(ticketId: number): void {
    this.clearTimers();
    this.state = 'reeling';
    this.reelPhase = 'fast';
    this.reelOffsetPx = 0;
    this.resultCard = null;
    this.loadingData = true;
    this.reelCards = [];
    this.startLoadingSequence();

    this.chatService.getDailyDrawCards().subscribe({
      next: (cards) => {
        const fallback = this.placeholderCard();
        this.reelCards = this.buildReelCards(cards ?? [], fallback);
        const imageUrls = (cards ?? []).map(c => c.cover_url).filter(Boolean);
        this.preloadImages(imageUrls).then(() => {
          this.finishLoading();
          setTimeout(() => {
            this.loadingData = false;
            this.chatService.drawWithTicket(ticketId).subscribe({
              next: (result: DrawResult) => {
                if (!result) { this.state = 'idle'; return; }
                this.runReel(result);
              },
              error: () => { this.state = 'idle'; },
            });
          }, 400);
        });
      },
      error: () => {
        this.reelCards = this.buildReelCards([], this.placeholderCard());
        this.finishLoading();
        setTimeout(() => {
          this.loadingData = false;
          this.chatService.drawWithTicket(ticketId).subscribe({
            next: (result: DrawResult) => {
              if (!result) { this.state = 'idle'; return; }
              this.runReel(result);
            },
            error: () => { this.state = 'idle'; },
          });
        }, 400);
      },
    });
  }

  closeResult(): void {
    if (this.state === 'result') {
      this.state = 'idle';
      this.resultCard = null;
    }
  }

  private buildReelCards(pool: DrawCard[], winner: DrawCard): DrawCard[] {
    const cards = Array.from({ length: 26 }, () => this.placeholderCard());
    const source = pool.length > 0 ? [...pool] : [winner];
    for (let i = 0; i < cards.length; i++) {
      cards[i] = source[i % source.length] ?? this.placeholderCard();
    }
    cards[this.highlightIndex] = winner;
    return cards;
  }

  private normalizeResult(result: DrawResult): DrawCard {
    return {
      game_code: result.game_code,
      game_name: result.game_name,
      cover_url: result.cover_url || '',
      rating: result.rating,
      card_tier: result.card_tier,
      series_name: result.series_name || '',
      desc: result.desc ?? null,
      release_year: result.release_year ?? null,
      source: result.source ?? null,
    };
  }

  private getFinalOffset(): number {
    const slotWidth = 140;
    const cardWidth = 118;
    const containerWidth = 820;
    const centerOffset = (containerWidth / 2) - (cardWidth / 2);
    return centerOffset - (this.highlightIndex * slotWidth);
  }

  private placeholderCard(): DrawCard {
    const tiers = ['common', 'common', 'common', 'uncommon', 'uncommon', 'rare', 'epic', 'legendary'];
    const tier = tiers[Math.floor(Math.random() * tiers.length)];
    return { game_code: '', game_name: '', cover_url: '', rating: 0, card_tier: tier, series_name: '', desc: null, release_year: null, source: null };
  }
}
