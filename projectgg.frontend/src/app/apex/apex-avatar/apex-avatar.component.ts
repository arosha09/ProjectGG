import {
  Component,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostBinding,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ApexService } from '../apex.service';

interface Colors {
  hood1: string;
  hood2: string;
  hood3: string;
  hoodE: string;
  body1: string;
  body2: string;
  bodyH: string;
  arm1: string;
  arm2: string;
  arm3: string;
  armH: string;
  visor: string;
  visor2: string;
  shine: string;
  eye1: string;
  eye2: string;
  eye3: string;
  eyeG: string;
  mouth1: string;
  mouth2: string;
  pink1: string;
  pink2: string;
  hp1: string;
  hp2: string;
  hp3: string;
  glove1: string;
  glove2: string;
  glove3: string;
  chest1: string;
  chest2: string;
  diag1: string;
  diag2: string;
  ant1: string;
  ant2: string;
  collar1: string;
  collar2: string;
}

type FaceState =
  | 'normal'
  | 'booting'
  | 'shutting-down'
  | 'angry'
  | 'petted'
  | 'sleeping'
  | 'thinking'
  | 'listening';

// ─── Visor inner drawable bounds (pixel-art space) ───────────────────────────
const VISOR = { x: 15, y: 21, w: 18, h: 12 } as const;
const VCX = VISOR.x + VISOR.w / 2; // 24
const VCY = VISOR.y + VISOR.h / 2; // 27

@Component({
  selector: 'app-apex-avatar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apex-avatar.component.html',
  styleUrls: ['./apex-avatar.component.scss'],
})
export class ApexAvatarComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('avatarCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() visible = true;
  @Input() wakeWordState: string = 'idle';
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() animatingChange = new EventEmitter<boolean>();
  @Output() silenceDetected = new EventEmitter<void>();

  // _displayed controls host visibility (display:none when false).
  // It is set TRUE before boot begins so the canvas is in the DOM,
  // and set FALSE only after shutdown completes.
  private _displayed = false;

  @HostBinding('class.avatar-hidden')
  get hidden() {
    return !this._displayed;
  }

  private ctx!: CanvasRenderingContext2D;
  private offCanvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private readonly W = 72;
  private readonly H = 56;

  private readonly DISPLAY_W = 240;
  private readonly DISPLAY_H = 187;
  private readonly HEADER_MARGIN = 56;
  private readonly LABEL_OFFSET = 28;

  private rawMouseX = 0;
  private rawMouseY = 0;

  private smoothEx = 0;
  private smoothEy = 0;
  private targetEx = 0;
  private targetEy = 0;

  private al = 0;
  private phase = 0;
  private talk = 0;
  private talking = false;
  private micOn = false;
  private analyser: AnalyserNode | null = null;
  private fdata: Uint8Array | null = null;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;

  private blinkT = 0;
  private blinking = false;
  private animId = 0;

  private isSpeaking = false;
  private isListening = false;
  private isThinking = false;
  private isTyping = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private savedFaceState: FaceState | null = null;
  private silenceFrames = 0;
  private readonly SILENCE_THRESHOLD = 0.03;
  private readonly SILENCE_FRAMES_REQUIRED = 90;
  private subs: Subscription[] = [];
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundResize: (() => void) | null = null;

  // ─── Boot / shutdown phases ───────────────────────────────────────────────
  // bootPhase drives CSS classes AND render-loop gating:
  //   'off'    → canvas is blank (no body drawn), host hidden
  //   'booting'→ body drawn, loader in visor, bubble RIGHT of avatar
  //   'happy'  → body drawn, ^^ face
  //   'on'     → normal idle
  bootPhase: 'off' | 'booting' | 'happy' | 'on' = 'off';
  shutdownPhase: 'none' | 'sad' | 'dead' | 'shutting' = 'none';
  crtPhase: 'none' | 'on' | 'off' = 'none';

  isDragging = false;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private crtTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private bootDots = 0;
  private bootDotsTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownDots = 0;
  private shutdownDotsTimer: ReturnType<typeof setInterval> | null = null;
  pendingShutdown = false;

  // Guard: prevents double-boot when both ngOnChanges and ngAfterViewInit fire.
  private bootSequenceStarted = false;
  // Guard: blocks re-toggle while any animation is running.
  private toggleLocked = false;
  // Prevents re-entrant revert emit when toggleLocked blocks ngOnChanges.
  private revertGuard = false;
  // Guard: AfterViewInit has run (canvas is ready).
  private viewInitDone = false;

  readonly bootDotsArr = [0, 1, 2, 3];
  readonly shutdownDotsArr = [0, 1, 2, 3];
  get bootDotsIdx(): number {
    return this.bootDots % 4;
  }
  get shutdownDotsIdx(): number {
    return this.shutdownDots % 4;
  }

  faceState: FaceState = 'normal';
  private crtStartTime = 0;

  private shakeX = 0;
  private shakeY = 0;
  private shakeTimer = 0;

  private dragOffsetX = 0;
  private dragOffsetY = 0;
  posX = 0;
  posY = 0;

  // ─── Sleep ────────────────────────────────────────────────────────────────
  private lastActivityTime = Date.now();
  private readonly SLEEP_AFTER_MS = 8000;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private zzzBubbles: { x: number; y: number; life: number; size: number }[] = [];
  private zzzSpawnT = 0;

  // ─── Pet ──────────────────────────────────────────────────────────────────
  private petHistory: { x: number; t: number }[] = [];
  private petTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Loader animation counter ─────────────────────────────────────────────
  private loaderT = 0;

  private readonly C: Colors = {
    hood1: '#160930',
    hood2: '#221050',
    hood3: '#2e1668',
    hoodE: '#4a28a0',
    body1: '#110828',
    body2: '#1c0e40',
    bodyH: '#3a1c80',
    arm1: '#1a0b35',
    arm2: '#27114d',
    arm3: '#351870',
    armH: '#4022a0',
    visor: '#06030c',
    visor2: '#0e0620',
    shine: '#4a30a8',
    eye1: '#f0c0ff',
    eye2: '#dd99ff',
    eye3: '#cc77ee',
    eyeG: '#aa55cc',
    mouth1: '#eeb0ff',
    mouth2: '#dd88ff',
    pink1: '#cc55dd',
    pink2: '#ee77ff',
    hp1: '#160830',
    hp2: '#221050',
    hp3: '#3a1c80',
    glove1: '#180838',
    glove2: '#261050',
    glove3: '#3a1878',
    chest1: '#0e0620',
    chest2: '#1a0c38',
    diag1: '#8833aa',
    diag2: '#bb55dd',
    ant1: '#3a1c80',
    ant2: '#6644bb',
    collar1: '#160830',
    collar2: '#2e1668',
  };

  constructor(
    private apexService: ApexService,
    private cdr: ChangeDetectorRef,
  ) {
    this.posX = 20;
    this.posY = 20;
  }

  ngOnInit(): void {
    this.boundMouseMove = this.onMouseMove.bind(this);
    document.addEventListener('mousemove', this.boundMouseMove);

    this.boundKeyDown = () => {
      this.recordActivity();
      this.isTyping = true;
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        this.isTyping = false;
      }, 800);
    };
    document.addEventListener('keydown', this.boundKeyDown);

    this.boundResize = () => this.clampPosition();
    window.addEventListener('resize', this.boundResize);

    this.subs.push(
      this.apexService.speaking$.subscribe((v) => {
        this.isSpeaking = v;
        this.talking = v;
      }),
      this.apexService.listening$.subscribe((v) => {
        this.isListening = v;
        if (v) this.startMicCapture();
        else this.stopMicCapture();
      }),
      this.apexService.thinking$.subscribe((v) => {
        this.isThinking = v;
        if (v) {
          this.savedFaceState = this.faceState;
          this.faceState = 'thinking';
        } else {
          this.faceState = this.savedFaceState || 'normal';
          this.savedFaceState = null;
        }
      }),
    );

    // Keep host hidden (display:none via avatar-hidden) until boot begins.
    // The canvas element still exists in the DOM for AfterViewInit to grab.
    // The render loop gates on bootPhase === 'off' to keep the canvas blank
    // until the CRT animation starts.
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['wakeWordState'] && !changes['wakeWordState'].firstChange) {
      const wws = changes['wakeWordState'].currentValue;
      if (wws === 'wake-detected' || wws === 'command-recording' || wws === 'verifying') {
        this.savedFaceState = this.savedFaceState || this.faceState;
        this.faceState = 'listening';
      } else if (wws === 'idle' || wws === 'unauthorized' || wws === 'transcribing') {
        if (this.faceState === 'listening') {
          this.faceState = this.savedFaceState || 'normal';
        }
        this.savedFaceState = null;
      }
    }

    if (changes['visible'] && !changes['visible'].firstChange) {
      const newVal = changes['visible'].currentValue;
      const prevVal = changes['visible'].previousValue;

      if (this.toggleLocked) {
        // Revert the parent's toggle so the button snaps back.
        if (!this.revertGuard) {
          this.revertGuard = true;
          this.visibleChange.emit(prevVal);
        }
        return;
      }

      if (newVal && !prevVal) {
        // Turning ON: lock toggles until boot completes
        this.toggleLocked = true;
        this.bootSequenceStarted = false; // allow fresh boot
        this.cdr.markForCheck();
        if (this.viewInitDone) {
          // Canvas is ready — boot on next paint
          requestAnimationFrame(() => this.runBootSequence());
        }
        // else ngAfterViewInit will call runBootSequence once canvas is ready
      } else if (!newVal && prevVal) {
        // Turning OFF: lock toggles until shutdown completes
        this.toggleLocked = true;
        // Run shutdown (which will set _displayed=false when done)
        if (this.bootPhase !== 'on' && this.bootPhase !== 'off') {
          this.pendingShutdown = true;
        } else {
          requestAnimationFrame(() => this.runShutdownSequence());
        }
      }
    }
  }

  ngAfterViewInit(): void {
    const cv = this.canvasRef.nativeElement;
    this.ctx = cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = this.W;
    this.offCanvas.height = this.H;
    this.g = this.offCanvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;

    this.clampPosition();
    this.viewInitDone = true;

    // Start the render loop. It will draw nothing while bootPhase === 'off'.
    this.cdr.detectChanges();
    this.loop();

    // Boot immediately if visible (initial page load path).
    // Use rAF to match the toggle path — calling runBootSequence synchronously
    // inside ngAfterViewInit nests change detection and prevents host display
    // changes from flushing before wrapper styles are set.
    if (this.visible && !this.bootSequenceStarted) {
      this.cdr.markForCheck();
      requestAnimationFrame(() => this.runBootSequence());
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    cancelAnimationFrame(this.animId);
    this.stopMicCapture();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.boundMouseMove) document.removeEventListener('mousemove', this.boundMouseMove);
    if (this.boundKeyDown) document.removeEventListener('keydown', this.boundKeyDown);
    if (this.boundResize) window.removeEventListener('resize', this.boundResize);
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.crtTimer) clearTimeout(this.crtTimer);
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    if (this.bootDotsTimer) clearInterval(this.bootDotsTimer);
    if (this.shutdownDotsTimer) clearInterval(this.shutdownDotsTimer);
    if (this.petTimer) clearTimeout(this.petTimer);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
  }

  // ─── Position ─────────────────────────────────────────────────────────────

  private clampPosition(): void {
    const maxX = window.innerWidth - this.DISPLAY_W;
    const maxY = window.innerHeight - this.DISPLAY_H;
    this.posX = Math.max(0, Math.min(maxX, this.posX));
    this.posY = Math.max(this.HEADER_MARGIN + this.LABEL_OFFSET, Math.min(maxY, this.posY));
  }

  // ─── Sleep ────────────────────────────────────────────────────────────────

  private recordActivity(): void {
    this.lastActivityTime = Date.now();
    if (this.faceState === 'sleeping') {
      this.faceState = 'normal';
      this.zzzBubbles = [];
      this.cdr.markForCheck();
    }
    this.scheduleSleep();
  }

  private scheduleSleep(): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.bootPhase !== 'on') return;
    this.sleepTimer = setTimeout(() => {
      if (
        this.bootPhase === 'on' &&
        this.shutdownPhase === 'none' &&
        this.faceState === 'normal' &&
        !this.isDragging &&
        !this.isSpeaking &&
        !this.isListening
      ) {
        this.faceState = 'sleeping';
        this.zzzBubbles = [];
        this.cdr.markForCheck();
      }
    }, this.SLEEP_AFTER_MS);
  }

  // ─── Boot sequence ────────────────────────────────────────────────────────
  // Flow: off → crt-on (400ms, CRT switch-on animation)
  //       → booting (2000ms, loader + BOOTING bubble)
  //       → happy (1000ms, ^^ face)
  //       → on (idle)

  private runBootSequence(): void {
    if (this.bootSequenceStarted) return;
    this.bootSequenceStarted = true;
    this.toggleLocked = true;

    // On initial page load the parent apex component starts at opacity:0 and
    // transitions to opacity:1 over 0.4s after a 1s delay (class.loaded).
    // The avatar host is inside that parent — look past our own host
    // (which may be display:none) and check the parent's opacity.
    const avatarHost = this.canvasRef?.nativeElement?.parentElement
      ?.parentElement as HTMLElement | null;
    const parentHost = avatarHost?.parentElement as HTMLElement | null;
    if (parentHost && parseFloat(getComputedStyle(parentHost).opacity) < 0.99) {
      this.bootSequenceStarted = false;
      this.toggleLocked = false;
      requestAnimationFrame(() => this.runBootSequence());
      return;
    }

    this.animatingChange.emit(true);

    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    if (this.crtTimer) {
      clearTimeout(this.crtTimer);
      this.crtTimer = null;
    }
    if (this.bootDotsTimer) {
      clearInterval(this.bootDotsTimer);
      this.bootDotsTimer = null;
    }
    this.shutdownPhase = 'none';
    this.bootDots = 0;
    this.loaderT = 0;
    this.pendingShutdown = false;

    // Phase 0: CRT switch-on animation — reveal host, then animate via JS
    this._displayed = true;
    this.cdr.detectChanges();
    // Force host visible via direct DOM (bypasses @HostBinding flush timing)
    const hostEl = this.canvasRef.nativeElement.parentElement?.parentElement as HTMLElement | null;
    if (hostEl) {
      hostEl.classList.remove('avatar-hidden');
      hostEl.style.display = 'block';
      void hostEl.offsetHeight;
    }
    this.crtPhase = 'on';
    this.crtStartTime = performance.now();
    this.faceState = 'booting';
    // Set wrapper initial styles now (host is display:block after the force above)
    const wrapper = this.canvasRef.nativeElement.parentElement as HTMLElement | null;
    if (wrapper) {
      wrapper.style.transform = 'scaleY(0.005) scaleX(1)';
      wrapper.style.transformOrigin = 'center center';
      wrapper.style.willChange = 'transform';
    }
    this.cdr.detectChanges();

    this.crtTimer = setTimeout(() => {
      // Phase 1: Booting (loader in visor) — clear CRT styles
      const el = this.canvasRef.nativeElement.parentElement as HTMLElement | null;
      if (el) {
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.willChange = '';
      }
      this.crtPhase = 'none';
      this.bootPhase = 'booting';
      this.cdr.detectChanges();

      this.bootTimer = setTimeout(() => {
        // Phase 2: Happy face (^^)
        this.bootPhase = 'happy';
        this.cdr.markForCheck();

        this.bootTimer = setTimeout(() => {
          // Phase 3: Normal idle
          this.bootPhase = 'on';
          this.toggleLocked = false;
          this.revertGuard = false;
          this.animatingChange.emit(false);
          this.faceState = 'normal';
          if (this.bootDotsTimer) {
            clearInterval(this.bootDotsTimer);
            this.bootDotsTimer = null;
          }
          this.lastActivityTime = Date.now();
          this.scheduleSleep();
          this.cdr.markForCheck();

          if (this.pendingShutdown) {
            this.pendingShutdown = false;
            requestAnimationFrame(() => this.runShutdownSequence());
          }
        }, 1000);
      }, 2000);
    }, 200);
  }

  // ─── Shutdown sequence ────────────────────────────────────────────────────
  // Flow: sad (1500ms) → dead (1500ms) → shutting (2000ms)
  //       → crt-off (500ms, CRT switch-off animation) → host hidden

  private runShutdownSequence(): void {
    this.animatingChange.emit(true);

    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
    if (this.crtTimer) {
      clearTimeout(this.crtTimer);
      this.crtTimer = null;
    }
    if (this.shutdownDotsTimer) {
      clearInterval(this.shutdownDotsTimer);
      this.shutdownDotsTimer = null;
    }
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }

    this.shutdownPhase = 'none';
    this.faceState = 'shutting-down';
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.shutdownDots = 0;
        this.loaderT = 0;
        this.shutdownPhase = 'sad';
        this.cdr.detectChanges();

        this.shutdownTimer = setTimeout(() => {
          this.shutdownPhase = 'dead';
          this.cdr.markForCheck();

          this.shutdownTimer = setTimeout(() => {
            this.shutdownPhase = 'shutting';
            this.cdr.markForCheck();

            this.shutdownTimer = setTimeout(() => {
              // Hide bubble then start CRT switch-off animation
              this.shutdownPhase = 'none';
              this.crtPhase = 'off';
              this.cdr.detectChanges();

              this.crtTimer = setTimeout(() => {
                // Fully off
                this._displayed = false;
                this.crtPhase = 'none';
                this.faceState = 'normal';
                this.bootPhase = 'off';
                this.bootSequenceStarted = false;
                this.toggleLocked = false;
                this.revertGuard = false;
                this.animatingChange.emit(false);
                if (this.shutdownDotsTimer) {
                  clearInterval(this.shutdownDotsTimer);
                  this.shutdownDotsTimer = null;
                }
                this.cdr.detectChanges();
              }, 500);
            }, 2000);
          }, 1500);
        }, 1500);
      });
    });
  }

  // ─── Mouse ────────────────────────────────────────────────────────────────

  onMouseMove(e: MouseEvent): void {
    this.rawMouseX = e.clientX;
    this.rawMouseY = e.clientY;
    this.recordActivity();
    this.checkPetGesture(e.clientX, e.clientY);
  }

  private computeEyeTarget(): { ex: number; ey: number } {
    const headFracX = 24 / 48;
    const headFracY = 27 / 56;
    const headScreenX = this.posX + headFracX * this.DISPLAY_W;
    const headScreenY = this.posY + headFracY * this.DISPLAY_H;
    const dx = this.rawMouseX - headScreenX;
    const dy = this.rawMouseY - headScreenY;
    const fovRadius = 300;
    const nx = Math.max(-1, Math.min(1, dx / fovRadius));
    const ny = Math.max(-1, Math.min(1, dy / fovRadius));
    return { ex: nx * 2, ey: ny * 1.2 };
  }

  // ─── Pet ──────────────────────────────────────────────────────────────────

  private checkPetGesture(cx: number, cy: number): void {
    if (this.faceState === 'angry' || this.isDragging) return;
    const headTop = this.posY;
    const headBottom = this.posY + this.DISPLAY_H * 0.55;
    const headLeft = this.posX + this.DISPLAY_W * 0.15;
    const headRight = this.posX + this.DISPLAY_W * 0.85;
    if (cy < headTop || cy > headBottom || cx < headLeft || cx > headRight) return;

    const now = Date.now();
    this.petHistory = this.petHistory.filter((p) => now - p.t < 1500);
    this.petHistory.push({ x: cx, t: now });

    if (this.petHistory.length >= 3) {
      let reversals = 0;
      for (let i = 2; i < this.petHistory.length; i++) {
        const d1 = this.petHistory[i - 1].x - this.petHistory[i - 2].x;
        const d2 = this.petHistory[i].x - this.petHistory[i - 1].x;
        if (Math.abs(d1) > 4 && Math.abs(d2) > 4 && Math.sign(d1) !== Math.sign(d2)) reversals++;
      }
      if (reversals >= 3 && this.faceState !== 'petted') this.triggerPetted();
    }
  }

  private triggerPetted(): void {
    this.faceState = 'petted';
    this.petHistory = [];
    this.cdr.markForCheck();
    if (this.petTimer) clearTimeout(this.petTimer);
    this.petTimer = setTimeout(() => {
      if (this.faceState === 'petted') {
        this.faceState = 'normal';
        this.cdr.markForCheck();
      }
    }, 2000);
  }

  // ─── Drag ─────────────────────────────────────────────────────────────────

  onDragStart(e: MouseEvent | TouchEvent): void {
    if (this.bootPhase !== 'on' || this.shutdownPhase !== 'none') return;
    e.preventDefault();
    this.isDragging = true;
    this.faceState = 'angry';
    this.recordActivity();
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
    this.dragOffsetX = clientX - this.posX;
    this.dragOffsetY = clientY - this.posY;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      ev.preventDefault();
      const { clientX: cx, clientY: cy } = 'touches' in ev ? ev.touches[0] : ev;
      this.posX = cx - this.dragOffsetX;
      this.posY = cy - this.dragOffsetY;
      this.clampPosition();
      this.cdr.markForCheck();
    };
    const onUp = () => {
      this.isDragging = false;
      this.faceState = 'normal';
      this.shakeX = 0;
      this.shakeY = 0;
      this.recordActivity();
      this.cdr.markForCheck();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  // ─── Mic ──────────────────────────────────────────────────────────────────

  private startMicCapture(): void {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.micStream = stream;
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.fdata = new Uint8Array(this.analyser.frequencyBinCount);
        this.audioContext.createMediaStreamSource(stream).connect(this.analyser);
        this.micOn = true;
      })
      .catch(() => {});
  }

  private stopMicCapture(): void {
    this.micOn = false;
    this.analyser = null;
    this.fdata = null;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private micLevel(): number {
    if (!this.analyser || !this.fdata) return 0;
    this.analyser.getByteFrequencyData(this.fdata as any);
    return Math.min(1, this.fdata.reduce((a, v) => a + v, 0) / this.fdata.length / 55);
  }

  // ─── Talk ─────────────────────────────────────────────────────────────────

  private startTalkAnimation(ms: number): void {
    this.talking = true;
    const t0 = Date.now();
    const tick = () => {
      const p = (Date.now() - t0) / ms;
      if (p >= 1) {
        this.talking = false;
        this.talk = 0;
        return;
      }
      this.talk = 0.3 + 0.7 * Math.abs(Math.sin(p * 50)) * Math.random();
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ─── Pixel helpers ────────────────────────────────────────────────────────

  private px(x: number, y: number, col: string, a = 1): void {
    this.g.globalAlpha = a;
    this.g.fillStyle = col;
    this.g.fillRect(x, y, 1, 1);
    this.g.globalAlpha = 1;
  }

  private pr(x: number, y: number, w: number, h: number, col: string, a = 1): void {
    this.g.globalAlpha = a;
    this.g.fillStyle = col;
    this.g.fillRect(x, y, w, h);
    this.g.globalAlpha = 1;
  }

  // ─── Visor clip ───────────────────────────────────────────────────────────

  private beginVisorClip(): void {
    this.g.save();
    this.g.beginPath();
    this.g.rect(VISOR.x, VISOR.y, VISOR.w, VISOR.h);
    this.g.clip();
  }

  private endVisorClip(): void {
    this.g.restore();
  }

  // ─── 3×4 micro font ──────────────────────────────────────────────────────

  private readonly FONT3x4: Record<string, number[]> = {
    A: [0b010, 0b111, 0b101, 0b101],
    B: [0b110, 0b111, 0b101, 0b110],
    C: [0b011, 0b100, 0b100, 0b011],
    D: [0b110, 0b101, 0b101, 0b110],
    E: [0b111, 0b110, 0b100, 0b111],
    G: [0b011, 0b100, 0b101, 0b011],
    H: [0b101, 0b111, 0b101, 0b101],
    I: [0b111, 0b010, 0b010, 0b111],
    N: [0b101, 0b111, 0b111, 0b101],
    O: [0b111, 0b101, 0b101, 0b111],
    S: [0b011, 0b110, 0b001, 0b110],
    T: [0b111, 0b010, 0b010, 0b010],
    U: [0b101, 0b101, 0b101, 0b111],
    W: [0b101, 0b101, 0b111, 0b010],
    Z: [0b111, 0b001, 0b100, 0b111],
    '.': [0b000, 0b000, 0b000, 0b010],
    ' ': [0b000, 0b000, 0b000, 0b000],
  };

  private drawMicroChar(ch: string, ox: number, oy: number, col: string, a = 1): void {
    const rows = this.FONT3x4[ch.toUpperCase()];
    if (!rows) return;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        if (rows[r] & (4 >> c)) this.px(ox + c, oy + r, col, a);
      }
    }
  }

  private drawMicroText(text: string, ox: number, oy: number, col: string, a = 1): void {
    for (let i = 0; i < text.length; i++) {
      this.drawMicroChar(text[i], ox + i * 4, oy, col, a);
    }
  }

  // ─── Canvas speech bubble — drawn on the DISPLAY canvas (post-blit) ───────
  // The bubble is positioned to the RIGHT of the avatar.
  //
  // The display canvas is 288×224px (= W*4 × H*4). The avatar body occupies
  // roughly x:24–216px of the 288px-wide canvas. We want the bubble to appear
  // clearly to the right of the head. We draw it starting at bx = canvas_right
  // minus bubble_width, anchored to the right edge with a LEFT-pointing tail.
  //
  // "Right of avatar" on canvas means bx ≈ 170–280px depending on text width.
  // The pointer tail points LEFT (back toward the avatar head at ~x=144).
  //
  // Parameters:
  //   text       — label string
  //   textColor  — e.g. '#dd99ff'
  //   borderColor — glow/border color
  //   anchorY    — vertical center of the tail on the display canvas (in px)
  private drawRightBubble(
    text: string,
    textColor: string,
    borderColor: string,
    anchorY: number,
  ): void {
    const ctx = this.ctx;
    const fontSize = 18;
    ctx.save();
    ctx.font = `bold ${fontSize}px 'Share Tech Mono', monospace`;
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText(text);
    const padX = 10;
    const padY = 6;
    const bw = Math.ceil(metrics.width) + padX * 2;
    const bh = fontSize + padY * 2;

    // Position to the right of the head (head right edge ~x=152px display)
    const bx = 158;
    const by = anchorY - bh / 2;

    if (bx + bw > this.ctx.canvas.width) {
      ctx.restore();
      return;
    }

    // Dark background
    ctx.fillStyle = 'rgba(8, 3, 20, 0.96)';
    ctx.fillRect(bx, by, bw, bh);

    // Outer glow + border
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

    // Inner accent border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = borderColor;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);
    ctx.globalAlpha = 1;

    // LEFT-pointing tail (pointing back toward the avatar head)
    const tailX = bx; // tail base is the left edge of the bubble
    const tailMidY = by + bh / 2;
    ctx.fillStyle = 'rgba(8, 3, 20, 0.96)';
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(tailX, tailMidY - 6);
    ctx.lineTo(tailX - 10, tailMidY);
    ctx.lineTo(tailX, tailMidY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Text
    ctx.fillStyle = textColor;
    ctx.shadowColor = textColor;
    ctx.shadowBlur = 4;
    ctx.fillText(text, bx + padX, by + padY);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ─── "PUT ME DOWN" bubble — RIGHT of avatar, angry pink ──────────────────
  private drawPutMeDownBubble(): void {
    const ctx = this.ctx;
    const text = 'PUT ME DOWN!!';
    const fontSize = 18;
    ctx.save();
    ctx.font = `bold ${fontSize}px 'Orbitron', sans-serif`;
    ctx.textBaseline = 'top';

    const metrics = ctx.measureText(text);
    const padX = 10;
    const padY = 6;
    const bw = Math.ceil(metrics.width) + padX * 2;
    const bh = fontSize + padY * 2;
    const canvasW = this.W * 4; // 288

    const bx = canvasW - bw - 6;
    // Place above center, near the head area
    const by = 10;

    if (bx < 0) {
      ctx.restore();
      return;
    }

    ctx.fillStyle = 'rgba(20, 4, 35, 0.96)';
    ctx.fillRect(bx, by, bw, bh);

    ctx.shadowColor = '#ee77ff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ee77ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#cc55dd';
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);
    ctx.globalAlpha = 1;

    // LEFT-pointing tail
    const tailMidY = by + bh / 2;
    ctx.fillStyle = 'rgba(20, 4, 35, 0.96)';
    ctx.shadowColor = '#ee77ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(bx, tailMidY - 6);
    ctx.lineTo(bx - 10, tailMidY);
    ctx.lineTo(bx, tailMidY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ee77ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ee77ff';
    ctx.shadowColor = 'rgba(238, 119, 255, 0.7)';
    ctx.shadowBlur = 5;
    ctx.fillText(text, bx + padX, by + padY);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ─── Loading arc ──────────────────────────────────────────────────────────

  private drawLoader(col: string): void {
    const r = 4;
    const numDots = 8;
    const t = this.loaderT;
    for (let i = 0; i < numDots; i++) {
      const angle = (i / numDots) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.round(Math.cos(angle) * r);
      const dy = Math.round(Math.sin(angle) * r);
      const dist = (i - (Math.floor(t) % numDots) + numDots) % numDots;
      const alpha =
        dist === 0 ? 1.0 : dist === 1 ? 0.7 : dist === 2 ? 0.45 : dist === 3 ? 0.2 : 0.06;
      this.px(VCX + dx, VCY + dy, col, alpha);
    }
  }

  // ─── Main render loop ─────────────────────────────────────────────────────
  //
  // CANVAS BLANK RULE:
  //   bootPhase === 'off'       → completely blank (pre-boot / post-shutdown)
  //
  // In all three cases we skip drawing the body so the avatar does NOT flash
  // before the CRT animation, and does NOT remain visible after it collapses.

  private loop = (): void => {
    this.phase += 0.035;
    this.loaderT += 0.12;

    // Vary talk value while speaking for natural mouth movement
    if (this.talking) {
      this.talk = 0.3 + 0.7 * Math.abs(Math.sin(this.phase * 15)) * Math.random();
    }

    // Read mic audio level into al
    if (this.analyser && this.fdata && this.micOn) {
      this.analyser.getByteFrequencyData(this.fdata as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < this.fdata.length; i++) sum += this.fdata[i];
      this.al = sum / this.fdata.length / 255;

      // Silence detection — auto-stop after sustained quiet
      if (this.al < this.SILENCE_THRESHOLD) {
        this.silenceFrames++;
        if (this.silenceFrames >= this.SILENCE_FRAMES_REQUIRED) {
          this.silenceFrames = 0;
          this.silenceDetected.emit();
        }
      } else {
        this.silenceFrames = 0;
      }
    } else {
      this.al = 0;
      this.silenceFrames = 0;
    }

    this.blinkT++;
    if (this.blinkT > 280 && !this.blinking) {
      this.blinking = true;
      this.blinkT = 0;
    }
    const blink = this.blinking && this.blinkT < 3;
    if (this.blinkT > 5) this.blinking = false;

    const active = this.talking || this.micOn;
    if (!active && (this.faceState === 'normal' || this.faceState === 'petted')) {
      const { ex: tex, ey: tey } = this.computeEyeTarget();
      this.targetEx = Math.max(-2, Math.min(2, tex));
      this.targetEy = Math.max(-1, Math.min(1, tey));
    } else if (this.faceState !== 'angry') {
      this.targetEx = 0;
      this.targetEy = 0;
    }
    this.smoothEx += (this.targetEx - this.smoothEx) * 0.1;
    this.smoothEy += (this.targetEy - this.smoothEy) * 0.1;
    const ex = Math.round(this.smoothEx * 2) / 2;
    const ey = Math.round(this.smoothEy * 2) / 2;

    const pulse = Math.sin(this.phase) * 0.5 + 0.5;
    const gA = 0.55 + 0.35 * pulse + this.al * 0.5;
    const mouthOpen = Math.max(this.al * 0.9, this.talking ? this.talk : 0);

    if (this.isDragging) {
      this.shakeTimer++;
      this.shakeX = Math.round(Math.sin(this.shakeTimer * 1.2) * 2);
      this.shakeY = Math.round(Math.cos(this.shakeTimer * 0.9) * 1.5);
    }

    // ── BLANK STATE: clear canvas before boot / after CRT off completes ──────
    // Draw avatar during crt-on so the CSS expansion animation reveals it.
    // Keep drawing during crt-off so the CSS collapse animation has content.
    const isBlank = this.bootPhase === 'off' && this.crtPhase === 'none';

    const BASE_CW = this.W * 4; // 288 — avatar blit width (always 4x)
    const dH = this.H * 4; // 224
    const BUBBLE_CW = 420; // wide enough for "SHUTTING DOWN" + padding

    // Dynamic canvas width: wider when bubbles are shown, default otherwise
    const needsWide =
      this.bootPhase === 'booting' || this.shutdownPhase === 'shutting' || this.isDragging;
    const dW = needsWide ? BUBBLE_CW : BASE_CW;

    // Resize canvas element + CSS when width changes (preserves avatar scale)
    const canvas = this.ctx.canvas as HTMLCanvasElement;
    if (canvas.width !== dW) {
      canvas.width = dW;
      canvas.style.width = `${(dW * 240) / BASE_CW}px`;
      this.ctx.imageSmoothingEnabled = false;
    }

    if (isBlank) {
      // Keep canvas transparent
      this.g.clearRect(0, 0, this.W, this.H);
      this.ctx.clearRect(0, 0, dW, dH);
      this.animId = requestAnimationFrame(this.loop);
      return;
    }

    // ── CRT ON animation (JavaScript-driven, not CSS) ──────────────────────
    if (this.crtPhase === 'on') {
      const elapsed = performance.now() - this.crtStartTime;
      const t = Math.min(elapsed / 200, 1);
      // cubic-bezier(0.22, 1, 0.36, 1) approximation
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const scaleY = 0.005 + (1 - 0.005) * ease;
      const el = this.canvasRef.nativeElement.parentElement as HTMLElement | null;
      if (el) {
        el.style.transform = `scaleY(${scaleY}) scaleX(1)`;
      }
    }

    this.g.clearRect(0, 0, this.W, this.H);
    const C = this.C;

    // ── Structure ─────────────────────────────────────────────────────────────

    this.pr(14, 0, 2, 7, C.ant2);
    this.px(13, 1, C.ant1);
    this.px(16, 1, C.ant1);
    this.pr(32, 0, 2, 7, C.ant2);
    this.px(31, 1, C.ant1);
    this.px(34, 1, C.ant1);
    this.pr(14, 0, 2, 2, C.pink1);
    this.pr(32, 0, 2, 2, C.pink1);

    this.pr(6, 30, 36, 8, C.hood1);
    this.pr(5, 26, 38, 6, C.hood1);
    this.pr(7, 22, 34, 6, C.hood1);
    this.pr(9, 17, 30, 7, C.hood2);
    this.pr(11, 12, 26, 7, C.hood2);
    this.pr(13, 7, 22, 7, C.hood2);
    this.pr(14, 4, 20, 5, C.hood3);
    this.pr(6, 26, 2, 12, C.hood3);
    this.pr(38, 26, 2, 12, C.hood3);
    this.pr(8, 20, 2, 8, C.hood3);
    this.pr(38, 20, 2, 8, C.hood3);
    this.pr(10, 14, 2, 8, C.hood2);
    this.pr(36, 14, 2, 8, C.hood2);
    this.pr(10, 28, 28, 8, C.hood1);
    this.pr(12, 23, 24, 8, C.body1);
    this.pr(13, 18, 22, 8, C.body1);

    this.px(23, 5, C.pink2);
    this.px(24, 5, C.pink2);
    this.px(22, 6, C.pink1);
    this.px(23, 6, C.pink2);
    this.px(24, 6, C.pink2);
    this.px(25, 6, C.pink1);
    this.px(21, 7, C.pink1);
    this.px(22, 7, C.pink1);
    this.px(23, 7, C.pink1);
    this.px(24, 7, C.pink1);
    this.px(25, 7, C.pink1);
    this.px(26, 7, C.pink1);
    this.px(23, 6, C.hood3);
    this.px(24, 6, C.hood3);

    this.pr(14, 16, 20, 2, C.hp2);
    this.pr(15, 15, 18, 2, C.hp3);
    this.pr(7, 15, 8, 9, C.hp1);
    this.pr(8, 15, 6, 8, C.hp2);
    this.pr(9, 16, 4, 6, C.hp3);
    this.px(7, 15, C.hp3);
    this.px(14, 15, C.hp3);
    this.px(7, 23, C.hp3);
    this.px(14, 23, C.hp3);
    this.pr(33, 15, 8, 9, C.hp1);
    this.pr(33, 15, 6, 8, C.hp2);
    this.pr(34, 16, 4, 6, C.hp3);
    this.px(33, 15, C.hp3);
    this.px(40, 15, C.hp3);
    this.px(33, 23, C.hp3);
    this.px(40, 23, C.hp3);

    this.pr(13, 22, 22, 14, C.visor2);
    this.pr(14, 20, 20, 15, C.visor2);
    this.pr(15, 19, 18, 16, C.visor2);
    this.pr(13, 20, 2, 14, C.shine);
    this.pr(33, 20, 2, 14, C.shine);
    this.pr(14, 19, 20, 2, C.shine);
    this.pr(14, 34, 20, 1, C.shine);

    this.pr(15, 21, 18, 12, C.visor);
    this.pr(16, 20, 16, 13, C.visor);
    this.pr(16, 21, 5, 1, C.visor2);
    this.pr(16, 22, 3, 1, C.visor2);

    // A Badges
    this.px(10, 24, C.pink1);
    this.px(11, 24, C.pink1);
    this.px(12, 24, C.pink1);
    this.px(10, 25, C.pink1);
    this.px(12, 25, C.pink1);
    this.px(10, 26, C.pink2);
    this.px(11, 26, C.pink2);
    this.px(12, 26, C.pink2);
    this.px(10, 27, C.pink1);
    this.px(12, 27, C.pink1);
    this.px(10, 28, C.pink1);
    this.px(12, 28, C.pink1);
    this.px(35, 24, C.pink1);
    this.px(36, 24, C.pink1);
    this.px(37, 24, C.pink1);
    this.px(35, 25, C.pink1);
    this.px(37, 25, C.pink1);
    this.px(35, 26, C.pink2);
    this.px(36, 26, C.pink2);
    this.px(37, 26, C.pink2);
    this.px(35, 27, C.pink1);
    this.px(37, 27, C.pink1);
    this.px(35, 28, C.pink1);
    this.px(37, 28, C.pink1);

    // ── VISOR CONTENT ─────────────────────────────────────────────────────────
    // Priority (blank states handled above via early return):
    //   0. CRT-on active       → visor stays blank (expansion reveals empty visor)
    //   1. shutdownPhase active → shutdown faces
    //   2. bootPhase active     → boot faces
    //   3. faceState            → normal / angry / petted / sleeping

    if (this.crtPhase !== 'none') {
      // During CRT-on expansion or CRT-off collapse the visor stays dark/blank.
    } else if (this.shutdownPhase !== 'none') {
      this.beginVisorClip();

      if (this.shutdownPhase === 'sad') {
        this.pr(19, 24, 3, 1, C.eye3, 0.8);
        this.pr(20, 25, 2, 1, C.eye3, 0.6);
        this.pr(26, 24, 3, 1, C.eye3, 0.8);
        this.pr(26, 25, 2, 1, C.eye3, 0.6);
        this.px(20, 30, C.mouth1);
        this.px(21, 29, C.mouth1);
        this.px(22, 29, C.mouth1);
        this.px(23, 29, C.mouth1);
        this.px(24, 29, C.mouth1);
        this.px(25, 29, C.mouth1);
        this.px(26, 30, C.mouth1);
      } else if (this.shutdownPhase === 'dead') {
        const xx = '#ff4444';
        this.px(19, 23, xx);
        this.px(21, 23, xx);
        this.px(20, 24, xx);
        this.px(19, 25, xx);
        this.px(21, 25, xx);
        this.px(26, 23, xx);
        this.px(28, 23, xx);
        this.px(27, 24, xx);
        this.px(26, 25, xx);
        this.px(28, 25, xx);
        this.pr(21, 28, 6, 2, C.mouth2);
        this.pr(22, 28, 4, 1, C.visor);
      } else if (this.shutdownPhase === 'shutting') {
        this.drawLoader(C.eye3);
      }

      this.endVisorClip();
    } else if (this.bootPhase === 'booting' || this.bootPhase === 'happy') {
      this.beginVisorClip();

      if (this.bootPhase === 'booting') {
        this.drawLoader(C.eye2);
      } else {
        // happy: ^^ smile
        const lx = 19,
          rx = 27,
          ey2 = 25;
        this.px(lx, ey2 + 1, C.eye1, gA);
        this.px(lx + 1, ey2, C.eye1, gA);
        this.px(lx + 2, ey2 + 1, C.eye1, gA);
        this.px(rx, ey2 + 1, C.eye1, gA);
        this.px(rx + 1, ey2, C.eye1, gA);
        this.px(rx + 2, ey2 + 1, C.eye1, gA);
        this.px(20, 29, C.mouth1, gA);
        this.px(21, 30, C.mouth2, gA);
        this.px(22, 30, C.mouth1, gA);
        this.px(23, 30, C.mouth2, gA);
        this.px(24, 30, C.mouth1, gA);
        this.px(25, 29, C.mouth1, gA);
      }

      this.endVisorClip();
    } else {
      // Normal face states
      this.beginVisorClip();

      if (this.faceState === 'thinking') {
        // Eyes looking up slightly, subtle thoughtful expression
        const tl = Math.floor(this.loaderT) % 4;
        this.px(19, 23, C.eye2, gA);
        this.px(20, 22, C.eye1, gA);
        this.px(21, 23, C.eye2, gA);
        this.px(27, 23, C.eye2, gA);
        this.px(28, 22, C.eye1, gA);
        this.px(29, 23, C.eye2, gA);
        this.px(21, 29, C.mouth1, gA);
        this.px(22, 29, C.mouth1, gA);
        this.px(23, 29, C.mouth1, gA);
        this.px(24, 29, C.mouth1, gA);
        this.px(33, 22 + tl, C.eye3, 0.6);
      } else if (this.faceState === 'angry') {
        const sx = this.shakeX,
          sy = this.shakeY;
        const ac = '#ff4444';
        this.px(18 + sx, 22 + sy, ac);
        this.px(19 + sx, 23 + sy, ac);
        this.px(20 + sx, 23 + sy, ac);
        this.px(27 + sx, 23 + sy, ac);
        this.px(28 + sx, 23 + sy, ac);
        this.px(29 + sx, 22 + sy, ac);
        this.pr(18 + sx, 24 + sy, 4, 1, C.eye1, 0.9);
        this.pr(26 + sx, 24 + sy, 4, 1, C.eye1, 0.9);
        this.px(20 + sx, 30 + sy, C.mouth2);
        this.px(21 + sx, 29 + sy, C.mouth1);
        this.px(22 + sx, 29 + sy, C.mouth1);
        this.px(23 + sx, 29 + sy, C.mouth1);
        this.px(24 + sx, 29 + sy, C.mouth1);
        this.px(25 + sx, 30 + sy, C.mouth2);
      } else if (this.faceState === 'petted') {
        // Left eye >
        this.px(19, 23, C.eye1, gA);
        this.px(20, 24, C.eye1, gA);
        this.px(19, 25, C.eye1, gA);
        // Right eye
        this.px(28, 23, C.eye1, gA);
        this.px(27, 24, C.eye1, gA);
        this.px(28, 25, C.eye1, gA);
        // Blush
        this.pr(16, 27, 3, 1, C.pink1, 0.4 + 0.2 * Math.sin(this.phase * 3));
        this.pr(29, 27, 3, 1, C.pink1, 0.4 + 0.2 * Math.sin(this.phase * 3));
        // Mouth (smaller w)
        this.px(20, 31, C.mouth1, gA);
        this.px(21, 32, C.mouth2, gA);
        this.px(22, 32, C.mouth2, gA);
        this.px(23, 31, C.mouth1, gA);
        this.px(24, 32, C.mouth2, gA);
        this.px(25, 32, C.mouth2, gA);
        this.px(26, 31, C.mouth1, gA);
      } else if (this.faceState === 'sleeping') {
        this.pr(18, 25, 4, 1, C.eye3, 0.65);
        this.pr(26, 25, 4, 1, C.eye3, 0.65);
        this.px(21, 29, C.mouth1, 0.5);
        this.px(22, 29, C.mouth1, 0.5);
        this.px(23, 29, C.mouth1, 0.5);
        this.px(24, 29, C.mouth1, 0.5);
      } else if (this.faceState === 'listening' && !blink) {
        // Listening — wide attentive eyes, small focused mouth
        const cyan = '#00e5ff';
        const pulse = 0.7 + 0.3 * Math.sin(this.phase * 4);
        // Wide eyes
        this.px(19, 23, cyan, pulse);
        this.px(20, 22, C.eye1, gA);
        this.px(21, 23, cyan, pulse);
        this.px(27, 23, cyan, pulse);
        this.px(28, 22, C.eye1, gA);
        this.px(29, 23, cyan, pulse);
        // Eye glow
        this.px(20, 24, cyan, 0.3);
        this.px(28, 24, cyan, 0.3);
        // Small focused mouth
        this.px(22, 29, C.mouth1, gA);
        this.px(23, 29, C.mouth1, gA);
        this.px(24, 29, C.mouth1, gA);
        this.px(25, 29, C.mouth1, gA);
      } else {
        // NORMAL face
        if (!blink) {
          const lx = 19 + Math.round(ex),
            ly = 24 + Math.round(ey);
          const rx = 27 + Math.round(ex),
            ry = 24 + Math.round(ey);
          this.px(lx, ly, C.eye1, gA);
          this.px(lx - 1, ly + 1, C.eye2, gA);
          this.px(lx + 1, ly + 1, C.eye2, gA);
          this.px(lx, ly - 1, C.eyeG, gA * 0.35);
          this.px(rx, ry, C.eye1, gA);
          this.px(rx - 1, ry + 1, C.eye2, gA);
          this.px(rx + 1, ry + 1, C.eye2, gA);
          this.px(rx, ry - 1, C.eyeG, gA * 0.35);

          const mby = 29 + Math.round(ey * 0.3);
          if (mouthOpen > 0.15) {
            const ow = Math.max(1, Math.floor(mouthOpen * 3));
            this.pr(24 - ow, mby, ow * 2, 2, C.mouth1, gA);
            this.pr(23 - ow, mby + 1, ow * 2 + 2, 1, C.mouth2, gA * 0.7);
          } else {
            this.px(20, mby, C.mouth1, gA);
            this.px(21, mby + 1, C.mouth2, gA);
            this.px(22, mby + 1, C.mouth1, gA);
            this.px(23, mby + 2, C.mouth2, gA);
            this.px(24, mby + 1, C.mouth1, gA);
            this.px(25, mby + 1, C.mouth2, gA);
            this.px(26, mby, C.mouth1, gA);
          }
        } else {
          this.pr(18, 25, 4, 1, C.eye3);
          this.pr(26, 25, 4, 1, C.eye3);
          this.px(20, 29, C.mouth1);
          this.px(21, 30, C.mouth1);
          this.px(22, 30, C.mouth1);
          this.px(23, 31, C.mouth1);
          this.px(24, 30, C.mouth1);
          this.px(25, 30, C.mouth1);
          this.px(26, 29, C.mouth1);
        }
      }

      this.endVisorClip();
    }

// Visor audio pulse border
    if (
      (this.al > 0.05 || this.talking) &&
      !blink &&
      (this.faceState === 'normal' || this.faceState === 'angry' || this.faceState === 'petted')
    ) {
      const va = Math.min(1, this.al * 5 + this.talk * 2);
      this.pr(VISOR.x, VISOR.y, VISOR.w, 1, C.eye2, va * 0.9);
      this.pr(VISOR.x, VISOR.y + VISOR.h - 1, VISOR.w, 1, C.eye2, va * 0.9);
      this.pr(VISOR.x, VISOR.y, 1, VISOR.h, C.eye2, va * 0.9);
      this.pr(VISOR.x + VISOR.w - 1, VISOR.y, 1, VISOR.h, C.eye2, va * 0.9);
    } else if (this.micOn && !blink && this.faceState === 'normal') {
      const la = 0.15 + 0.1 * Math.sin(this.phase * 4);
      this.pr(VISOR.x, VISOR.y, VISOR.w, 1, C.eye3, la);
      this.pr(VISOR.x, VISOR.y + VISOR.h - 1, VISOR.w, 1, C.eye3, la);
    }

    // Collar
    this.pr(20, 34, 8, 4, C.collar1);
    this.pr(21, 34, 6, 3, C.collar2);
    this.px(23, 35, C.pink1);
    this.px(24, 35, C.pink1);

    // Body
    this.pr(13, 37, 22, 13, C.body1);
    this.pr(14, 37, 20, 12, C.body2);
    this.pr(15, 38, 18, 10, C.body2);
    this.pr(13, 37, 2, 13, C.bodyH);
    this.pr(33, 37, 2, 13, C.bodyH);
    this.pr(14, 37, 20, 1, C.bodyH);
    this.pr(23, 38, 1, 11, C.bodyH);
    this.pr(24, 38, 1, 5, C.body1);
    this.pr(15, 39, 18, 9, C.chest1);
    this.pr(16, 40, 16, 7, C.chest2);
    this.pr(15, 39, 1, 9, C.bodyH);
    this.pr(32, 39, 1, 9, C.bodyH);

    const dg = pulse > 0.6;
    this.px(23, 41, C.diag1);
    this.px(24, 41, C.diag1);
    this.px(22, 42, C.diag1);
    this.px(23, 42, dg ? C.diag2 : C.diag1);
    this.px(24, 42, dg ? C.diag2 : C.diag1);
    this.px(25, 42, C.diag1);
    this.px(23, 43, C.diag1);
    this.px(24, 43, C.diag2);
    this.px(25, 43, C.diag1);
    this.px(23, 44, C.diag1);
    this.px(24, 44, C.diag1);
    this.px(22, 43, C.diag2);

    this.pr(32, 38, 7, 7, C.body1);
    this.pr(33, 39, 5, 5, C.hp1);
    this.px(35, 39, C.pink1);
    this.px(34, 40, C.pink1);
    this.px(35, 40, C.pink2);
    this.px(36, 40, C.pink1);
    this.px(33, 41, C.pink1);
    this.px(34, 41, C.pink1);
    this.px(35, 41, C.pink1);
    this.px(36, 41, C.pink1);
    this.px(37, 41, C.pink1);
    this.px(35, 40, C.body1);

    // Typing: alternate hands up/down
    const ty = this.isTyping ? Math.round(Math.sin(this.phase * 12)) : 0;

    this.pr(6, 37, 8, 8, C.arm1);
    this.pr(7, 37, 6, 7, C.arm2);
    this.pr(8, 37, 4, 6, C.arm3);
    this.pr(6, 37, 1, 8, C.armH);
    this.pr(13, 37, 1, 8, C.armH);
    this.pr(7, 37, 6, 1, C.armH);

    this.pr(4, 43, 7, 8, C.arm1);
    this.pr(5, 43, 5, 7, C.arm2);
    this.pr(6, 44, 3, 5, C.arm3);
    this.pr(4, 43, 1, 8, C.armH);
    this.pr(10, 43, 1, 8, C.armH);
    this.pr(3, 50 + ty, 9, 5, C.glove1);
    this.pr(4, 50 + ty, 7, 4, C.glove2);
    this.pr(5, 51 + ty, 5, 3, C.glove3);
    this.px(3, 50 + ty, C.armH);
    this.px(11, 50 + ty, C.armH);
    this.px(5, 51 + ty, C.glove1);
    this.px(7, 51 + ty, C.glove1);
    this.px(9, 51 + ty, C.glove1);

    this.pr(37, 43, 7, 8, C.arm1);
    this.pr(37, 43, 5, 7, C.arm2);
    this.pr(38, 44, 3, 5, C.arm3);
    this.pr(37, 43, 1, 8, C.armH);
    this.pr(43, 43, 1, 8, C.armH);
    this.pr(36, 50 - ty, 9, 5, C.glove1);
    this.pr(37, 50 - ty, 7, 4, C.glove2);
    this.pr(38, 51 - ty, 5, 3, C.glove3);
    this.px(36, 50 - ty, C.armH);
    this.px(44, 50 - ty, C.armH);
    this.px(38, 51 - ty, C.glove1);
    this.px(40, 51 - ty, C.glove1);
    this.px(42, 51 - ty, C.glove1);

    // ── Blit offscreen → display canvas ──────────────────────────────────────
    // Avatar always blits at original 4x (BASE_CW × dH) — never stretched.
    this.ctx.clearRect(0, 0, dW, dH);
    this.ctx.drawImage(this.offCanvas, 0, 0, this.W, this.H, 0, 0, BASE_CW, dH);

    // ── Overlay bubbles on display canvas (post-blit) ─────────────────────────
    // Anchor Y: upper-right of head, near antenna level (pixel y≈8 × 4 = 32px)
    const headTopY = 8 * 4; // 32

    if (this.bootPhase === 'booting') {
      this.drawRightBubble('BOOTING...', '#dd99ff', '#6644aa', headTopY);
    } else if (this.shutdownPhase === 'shutting') {
      this.drawRightBubble('SHUTTING DOWN', '#ff7777', '#883333', headTopY);
    }

    if (this.isDragging) {
      this.drawPutMeDownBubble();
    }

    this.animId = requestAnimationFrame(this.loop);
  };

  // ─── Public API ───────────────────────────────────────────────────────────

  show(): void {
    if (this._displayed) return;
    this.visible = true;
    this.bootSequenceStarted = false;
    this.visibleChange.emit(true);
    this.cdr.markForCheck();
    if (this.viewInitDone) {
      this.runBootSequence();
    }
  }

  hide(): void {
    if (!this._displayed || this.shutdownPhase !== 'none') return;
    this.runShutdownSequence();
  }

  toggleVisibility(): void {
    if (this._displayed) this.hide();
    else this.show();
  }
}
