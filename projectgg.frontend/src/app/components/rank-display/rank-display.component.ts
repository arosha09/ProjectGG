import { Component, input, ElementRef, ViewChild, AfterViewInit, OnDestroy, ChangeDetectorRef, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { UserRankDto } from '../../models/rank.model';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
}

interface RankTheme {
  primary: [number, number, number];
  secondary: [number, number, number];
}

const RANK_THEMES: Record<string, RankTheme> = {
  VOID: { primary: [90, 95, 105],  secondary: [60, 65, 75] },
  IC:   { primary: [140, 155, 180], secondary: [80, 100, 130] },
  HC:   { primary: [0, 210, 190],   secondary: [0, 160, 140] },
  SF:   { primary: [70, 100, 220],  secondary: [120, 80, 200] },
  CB:   { primary: [160, 70, 220],  secondary: [120, 40, 180] },
  NF:   { primary: [220, 50, 70],   secondary: [180, 30, 50] },
  SP:   { primary: [230, 190, 60],  secondary: [200, 150, 30] },
  ASC:  { primary: [220, 100, 140], secondary: [100, 160, 230] },
};

function rgb(r: number, g: number, b: number): string {
  return `${r},${g},${b}`;
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

function hex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

@Component({
  selector: 'app-rank-display',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: './rank-display.component.html',
  styleUrls: ['./rank-display.component.scss'],
})
export class RankDisplayComponent implements AfterViewInit, OnDestroy {
  readonly userRank = input.required<UserRankDto | null>();
  readonly compact = input(false);

  @ViewChild('particleCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rankImg') rankImgRef!: ElementRef<HTMLImageElement>;

  glowColor = rgba(0, 243, 255, 0.35);
  glowColorIntense = rgba(0, 243, 255, 0.65);
  accentHex = '#00f3ff';
  barGlow = rgba(0, 243, 255, 0.4);

  private animFrame: number | null = null;
  private particles: Particle[] = [];
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: RankTheme = RANK_THEMES['VOID'];
  private resizeObs: ResizeObserver | null = null;
  imageLoaded = signal(false);

  constructor(private cdr: ChangeDetectorRef) {
    effect(() => {
      const rank = this.userRank();
      if (rank) this.applyTheme(rank.rank_code);
    });
  }

  get rankImageUrl(): string {
    const rank = this.userRank();
    if (!rank) return '';
    return rank.rank_image_url || '';
  }

  get xpLabel(): string {
    const rank = this.userRank();
    if (!rank) return '-- XP';
    if (rank.next_rank_code === 'MAX') return `${rank.total_xp} XP — MAX RANK`;
    return `${rank.total_xp} XP — ${rank.xp_to_next} to next`;
  }

  ngAfterViewInit(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      this.initCanvas();
      const rank = this.userRank();
      if (rank) this.applyTheme(rank.rank_code);
    });
  }

  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.resizeObs?.disconnect();
  }

  onImageLoad(): void {
    this.imageLoaded.set(true);
    this.cdr.markForCheck();
    if (!this.animFrame) this.startAnimation();
  }

  private applyTheme(rankCode: string): void {
    const prefix = this.extractPrefix(rankCode);
    const theme = RANK_THEMES[prefix] ?? RANK_THEMES['VOID'];
    this.theme = theme;

    const [pr, pg, pb] = theme.primary;
    const [sr, sg, sb] = theme.secondary;

    this.glowColor = rgba(pr, pg, pb, 0.35);
    this.glowColorIntense = rgba(pr, pg, pb, 0.65);
    this.accentHex = hex(pr, pg, pb);
    this.barGlow = rgba(pr, pg, pb, 0.4);
    this.cdr.markForCheck();
  }

  private extractPrefix(code: string): string {
    if (!code) return 'VOID';
    const upper = code.toUpperCase();
    if (upper.startsWith('ASC')) return 'ASC';
    for (const prefix of ['VOID', 'IC', 'HC', 'SF', 'CB', 'NF', 'SP']) {
      if (upper.startsWith(prefix)) return prefix;
    }
    return 'VOID';
  }

  private initCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };
    resize();
    this.ctx = canvas.getContext('2d');
    this.resizeObs = new ResizeObserver(() => resize());
    this.resizeObs.observe(parent);
  }

  private startAnimation(): void {
    this.animFrame = requestAnimationFrame(() => this.animate());
  }

  private animate(): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.particles.length < 18) {
      this.spawnParticles(1);
    }

    const [pr, pg, pb] = this.theme.primary;
    const [sr, sg, sb] = this.theme.secondary;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife) * 0.55;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.r, p.g, p.b, p.alpha);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.r, p.g, p.b, p.alpha * 0.06);
      ctx.fill();
    }

    this.animFrame = requestAnimationFrame(() => this.animate());
  }

  private spawnParticles(count: number): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const minR = 18;
    const maxR = 38;

    for (let i = 0; i < count; i++) {
      const usePrimary = Math.random() > 0.35;
      const [pr, pg, pb] = this.theme.primary;
      const [sr, sg, sb] = this.theme.secondary;
      const r = usePrimary ? pr : sr;
      const g = usePrimary ? pg : sg;
      const b = usePrimary ? pb : sb;

      const angle = Math.random() * Math.PI * 2;
      const radius = minR + Math.random() * (maxR - minR);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const outAngle = angle + (Math.random() - 0.5) * 0.8;
      const speed = 0.08 + Math.random() * 0.18;

      this.particles.push({
        x,
        y,
        vx: Math.cos(outAngle) * speed,
        vy: Math.sin(outAngle) * speed,
        size: 0.4 + Math.random() * 1.2,
        alpha: 0.25 + Math.random() * 0.2,
        r, g, b,
        life: 0,
        maxLife: 100 + Math.random() * 150,
      });
    }
  }
}
