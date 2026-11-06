import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PixelGameService } from '../../services/pixel-game.service';
import { Subject, takeUntil } from 'rxjs';

const TILE = 32;
const COLS = 40;
const ROWS = 25;
const W = COLS * TILE;
const H = ROWS * TILE;

const _ = 0;
const WALL = 1;
const PATH = 2;
const TALL = 3;
const TREE = 4;
const WATER = 5;
const CAVE = 6;
const BLDG = 7;
const BRIDGE = 8;

function buildMap(): number[][] {
  const m: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    m[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) m[r][c] = WALL;
      else m[r][c] = _;
    }
  }
  for (let r = 1; r <= 5; r++) for (let c = 1; c < COLS - 1; c++) m[r][c] = PATH;
  const bldgs = [[1,2,3,2],[1,6,3,2],[1,10,3,2],[1,14,3,2],[1,18,3,2],[1,22,3,2],[1,26,3,2],[1,30,3,2],[1,34,3,2],[3,8,2,2],[3,20,2,2],[3,28,2,2]];
  for (const [br,bc,bh,bw] of bldgs) {
    for (let dr = 0; dr < bh; dr++) for (let dc = 0; dc < bw; dc++) if (br+dr<ROWS-1 && bc+dc<COLS-1) m[br+dr][bc+dc] = WALL;
    if (br+bh < ROWS-1) m[br+bh][bc+Math.floor(bw/2)] = PATH;
  }
  for (let r = 1; r <= 5; r++) for (let c = 4; c < COLS-1; c += 4) if (m[r][c] !== WALL) m[r][c] = PATH;
  for (let r = 6; r <= 10; r++) for (let c = 1; c < COLS-1; c++) m[r][c] = _;
  for (let r = 5; r <= 10; r++) { m[r][18]=PATH; m[r][19]=PATH; m[r][20]=PATH; m[r][21]=PATH; }
  const tgPatches = [[6,2,2,4],[6,24,3,6],[6,34,4,4],[7,6,3,5],[8,12,2,4],[9,26,2,6],[10,2,2,8],[10,28,2,8]];
  for (const [tr,tc,th,tw] of tgPatches) for (let dr=0;dr<th;dr++) for (let dc=0;dc<tw;dc++) { const rr=tr+dr,cc=tc+dc; if (rr<ROWS-1&&cc<COLS-1&&m[rr][cc]===_) m[rr][cc]=TALL; }
  for (let r=11;r<=16;r++) for (let c=1;c<COLS-1;c++) if (m[r][c]===_) m[r][c]=TREE;
  for (let r=11;r<=16;r++) { m[r][18]=PATH; m[r][19]=PATH; m[r][20]=PATH; m[r][21]=PATH; }
  const clearings=[[12,4,3,5],[14,28,3,6],[12,32,2,4]];
  for (const [cr,cc,ch,cw] of clearings) for (let dr=0;dr<ch;dr++) for (let dc=0;dc<cw;dc++) { const rr=cr+dr,cc2=cc+dc; if (rr<ROWS-1&&cc2<COLS-1) m[rr][cc2]=_; }
  for (let r=17;r<=19;r++) for (let c=6;c<=32;c++) m[r][c]=WATER;
  for (let c=18;c<=21;c++) m[18][c]=BRIDGE;
  for (let r=17;r<=19;r++) { for (let c=1;c<6;c++) m[r][c]=_; for (let c=33;c<COLS-1;c++) m[r][c]=_; }
  for (let r=17;r<=19;r++) { for (let c=2;c<=4;c++) m[r][c]=TALL; for (let c=34;c<=36;c++) m[r][c]=TALL; }
  for (let r=20;r<=23;r++) for (let c=1;c<COLS-1;c++) m[r][c]=CAVE;
  for (let c=1;c<COLS-1;c++) m[20][c]=WALL;
  m[20][19]=CAVE; m[20][20]=CAVE; m[19][19]=_; m[19][20]=_;
  const caveGrass=[[21,4,2,5],[21,28,3,6],[22,10,2,6]];
  for (const [cr,cc,ch,cw] of caveGrass) for (let dr=0;dr<ch;dr++) for (let dc=0;dc<cw;dc++) { const rr=cr+dr,cc2=cc+dc; if (rr<ROWS-1&&cc2<COLS-1&&m[rr][cc2]===CAVE) m[rr][cc2]=TALL; }
  return m;
}

const MAP = buildMap();

function findSpawns(): {r:number;c:number}[] {
  const s: {r:number;c:number}[] = [];
  for (let r=1;r<ROWS-1;r++) for (let c=1;c<COLS-1;c++) if (MAP[r][c]===PATH) s.push({r,c});
  return s;
}
const SPAWNS = findSpawns();

interface CharType {
  id: string;
  name: string;
  title: string;
  hp: number;
  atk: number;
  def: number;
  color1: string;
  color2: string;
  color3: string;
  catchRate: number;
  minScore: number;
  biomes: number[];
}

const CHARS: CharType[] = [
  { id:'assassin', name:'Shadow Blade', title:'Assassin', hp:7, atk:4, def:0, color1:'#1a1a2e', color2:'#c0392b', color3:'#ecf0f1', catchRate:0.5, minScore:0, biomes:[_] },
  { id:'knight', name:'Iron Sentinel', title:'Knight', hp:12, atk:3, def:3, color1:'#7f8c8d', color2:'#2c3e50', color3:'#f39c12', catchRate:0.4, minScore:0, biomes:[_] },
  { id:'mage', name:'Arcane Weaver', title:'Mage', hp:6, atk:6, def:0, color1:'#8e44ad', color2:'#2980b9', color3:'#f1c40f', catchRate:0.35, minScore:50, biomes:[TALL] },
  { id:'rogue', name:'Phantom', title:'Rogue', hp:6, atk:5, def:0, color1:'#2c3e50', color2:'#e74c3c', color3:'#95a5a6', catchRate:0.45, minScore:0, biomes:[TALL,CAVE] },
  { id:'berserker', name:'Rage Bringer', title:'Berserker', hp:10, atk:7, def:0, color1:'#922b21', color2:'#1a1a1a', color3:'#f5b7b1', catchRate:0.3, minScore:100, biomes:[CAVE] },
  { id:'paladin', name:'Lightsworn', title:'Paladin', hp:14, atk:3, def:4, color1:'#f0e68c', color2:'#daa520', color3:'#fffacd', catchRate:0.25, minScore:150, biomes:[TREE,_] },
  { id:'nomad', name:'Desert Ghost', title:'Nomad', hp:8, atk:4, def:1, color1:'#d4a574', color2:'#8b4513', color3:'#ffe4b5', catchRate:0.4, minScore:0, biomes:[TALL,CAVE] },
  { id:'techno', name:'Cyber Specter', title:'Technomancer', hp:7, atk:5, def:1, color1:'#00ffff', color2:'#0d0d0d', color3:'#ff00ff', catchRate:0.2, minScore:200, biomes:[CAVE] },
];

const BIOME_COLORS: Record<number,{fill:string;alt:string}> = {
  [WALL]:{fill:'#1a1a2e',alt:'#2a2a4e'},
  [PATH]:{fill:'#8b7355',alt:'#7a6345'},
  [_]:{fill:'#3a7d32',alt:'#2d6b28'},
  [TALL]:{fill:'#2d6b28',alt:'#1f5a1a'},
  [TREE]:{fill:'#1a4a1a',alt:'#153815'},
  [WATER]:{fill:'#1a4a6b',alt:'#2a6b8f'},
  [CAVE]:{fill:'#2a2a2a',alt:'#222222'},
  [BLDG]:{fill:'#5a4a3a',alt:'#4a3a2a'},
  [BRIDGE]:{fill:'#6b5b3a',alt:'#5a4a2a'},
};

interface Monster {
  type: CharType;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
}

interface Particle {
  x:number;y:number;vx:number;vy:number;life:number;color:string;
}

interface KeyBinds {
  up: string;
  down: string;
  left: string;
  right: string;
  confirm: string;
  cancel: string;
  menu: string;
}

const DEFAULT_BINDS: KeyBinds = { up:'w', down:'s', left:'a', right:'d', confirm:'enter', cancel:'escape', menu:'tab' };

@Component({
  selector: 'app-pixel-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pixel-game-wrap" [class.fullscreen]="isFullscreen">
      <div class="game-toolbar" *ngIf="!isFullscreen">
        <button class="toolbar-btn" (click)="toggleFullscreen()" matTooltip="Fullscreen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
        <button class="toolbar-btn" (click)="showSettings = !showSettings" matTooltip="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button class="toolbar-btn" (click)="closeGame()" matTooltip="Close Game">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <canvas #canvas [width]="canvasW" [height]="canvasH"
        (keydown)="onKeyDown($event)" (keyup)="onKeyUp($event)" tabindex="0">
      </canvas>

      <!-- Settings overlay -->
      <div class="pixel-overlay" *ngIf="showSettings">
        <div class="pixel-overlay-box settings-box">
          <h2>SETTINGS</h2>
          <div class="settings-grid">
            <div class="settings-col">
              <h3>Keybinds</h3>
              <div class="keybind-row" *ngFor="let bind of keybindList">
                <span class="keybind-label">{{bind.label}}</span>
                <button class="keybind-btn" [class.listening]="listeningKey === bind.key"
                  (click)="startRebind(bind.key)">
                  {{getKeyDisplay(keyBinds[bind.key])}}
                </button>
              </div>
            </div>
            <div class="settings-col">
              <h3>Display</h3>
              <div class="setting-toggle-row">
                <span>Fullscreen</span>
                <button class="toggle-btn" (click)="toggleFullscreen()">{{isFullscreen ? 'ON' : 'OFF'}}</button>
              </div>
              <div class="setting-toggle-row">
                <span>Show FPS</span>
                <button class="toggle-btn" (click)="showFps = !showFps">{{showFps ? 'ON' : 'OFF'}}</button>
              </div>
              <div class="setting-toggle-row">
                <span>Screen Shake</span>
                <button class="toggle-btn" (click)="screenShake = !screenShake">{{screenShake ? 'ON' : 'OFF'}}</button>
              </div>
              <div class="setting-toggle-row">
                <span>Particle FX</span>
                <button class="toggle-btn" (click)="particlesEnabled = !particlesEnabled">{{particlesEnabled ? 'ON' : 'OFF'}}</button>
              </div>
              <h3 style="margin-top:12px">Scale</h3>
              <div class="scale-btns">
                <button class="scale-btn" [class.active]="canvasScale===1" (click)="setScale(1)">1x</button>
                <button class="scale-btn" [class.active]="canvasScale===2" (click)="setScale(2)">2x</button>
              </div>
            </div>
          </div>
          <button class="pixel-btn" (click)="showSettings = false" style="margin-top:16px">CLOSE</button>
        </div>
      </div>

      <!-- Menu overlay -->
      <div class="pixel-overlay" *ngIf="gameState === 'menu' && !showSettings">
        <div class="pixel-overlay-box">
          <div class="pixel-title-art"><pre>{{titleArt}}</pre></div>
          <p class="pixel-subtitle">A pixel character-catching adventure</p>
          <div class="pixel-controls-hint">
            <span><kbd>{{getKeyDisplay(keyBinds.up)}}</kbd><kbd>{{getKeyDisplay(keyBinds.left)}}</kbd><kbd>{{getKeyDisplay(keyBinds.down)}}</kbd><kbd>{{getKeyDisplay(keyBinds.right)}}</kbd> Move</span>
            <span><kbd>{{getKeyDisplay(keyBinds.confirm)}}</kbd> Select</span>
            <span><kbd>{{getKeyDisplay(keyBinds.cancel)}}</kbd> Back</span>
            <span><kbd>{{getKeyDisplay(keyBinds.menu)}}</kbd> Settings</span>
          </div>
          <button class="pixel-btn" (click)="startGame()">NEW ADVENTURE</button>
        </div>
      </div>

      <!-- Game over overlay -->
      <div class="pixel-overlay" *ngIf="gameState === 'gameover' && !showSettings">
        <div class="pixel-overlay-box">
          <h2>ADVENTURE COMPLETE</h2>
          <div class="pixel-rewards">
            <div class="pixel-reward-row"><span>Enemies Defeated</span><span class="pixel-val">{{enemiesKilled}}</span></div>
            <div class="pixel-reward-row"><span>Characters Caught</span><span class="pixel-val">{{monstersCaught}}</span></div>
            <div class="pixel-reward-row"><span>Steps Taken</span><span class="pixel-val">{{stepsTaken}}</span></div>
            <div class="pixel-reward-row"><span>Score</span><span class="pixel-val">{{finalScore}}</span></div>
            <div class="pixel-reward-row pixel-reward-xp" *ngIf="rewards"><span>XP Earned</span><span class="pixel-val">+{{rewards.run.xp_awarded}}</span></div>
            <div class="pixel-reward-row pixel-reward-ticket" *ngIf="rewards?.run?.tickets_awarded"><span>Draw Tickets</span><span class="pixel-val">+{{rewards.run.tickets_awarded}}</span></div>
            <div class="pixel-reward-row pixel-reward-caught" *ngIf="rewards?.run?.monsters_caught?.length">
              <span>Caught</span><span class="pixel-val">{{rewards.run.monsters_caught.join(', ')}}</span>
            </div>
          </div>
          <button class="pixel-btn" (click)="startGame()">PLAY AGAIN</button>
          <button class="pixel-btn pixel-btn-sm" (click)="closeGame()">CLOSE</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pixel-game-wrap { position:relative; display:flex; align-items:center; justify-content:center; flex-direction:column; width:100%; height:100%; }
    .pixel-game-wrap.fullscreen { position:fixed; inset:0; z-index:99999; background:#000; }
    .pixel-game-wrap.fullscreen canvas { width:100vw; height:100vh; object-fit:contain; }
    .game-toolbar { display:flex; gap:6px; margin-bottom:6px; }
    .toolbar-btn { width:32px; height:32px; border-radius:6px; border:1px solid rgba(0,240,255,0.2); background:rgba(0,0,0,0.5); color:rgba(0,240,255,0.7); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
    .toolbar-btn:hover { background:rgba(0,240,255,0.1); border-color:rgba(0,240,255,0.5); color:#0ff; }
    canvas { display:block; outline:none; cursor:crosshair; border:1px solid rgba(0,240,255,0.2); border-radius:4px; image-rendering:pixelated; }
    .pixel-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); border-radius:4px; z-index:10; }
    .pixel-overlay-box { text-align:center; color:#0ff; font-family:'Press Start 2P','Share Tech Mono',monospace; max-width:560px; padding:24px; }
    .pixel-overlay-box h2 { font-size:16px; margin:0 0 16px; text-shadow:0 0 12px rgba(0,240,255,0.5); }
    .pixel-title-art pre { font-size:5px; line-height:1.1; color:#a855f7; text-shadow:0 0 8px rgba(168,85,247,0.4); margin:0 0 8px; }
    .pixel-subtitle { font-size:8px; color:rgba(0,240,255,0.6); margin:0 0 16px; }
    .pixel-controls-hint { display:flex; gap:12px; justify-content:center; margin-bottom:16px; font-size:7px; flex-wrap:wrap; color:rgba(255,255,255,0.5); }
    .pixel-controls-hint kbd { display:inline-block; background:rgba(0,240,255,0.1); border:1px solid rgba(0,240,255,0.3); border-radius:2px; padding:1px 4px; font-family:inherit; font-size:7px; margin-right:2px; }
    .pixel-btn { padding:10px 24px; background:rgba(0,240,255,0.1); border:1px solid #0ff; color:#0ff; font-family:'Press Start 2P','Share Tech Mono',monospace; font-size:10px; cursor:pointer; transition:all 0.15s; text-transform:uppercase; letter-spacing:1px; }
    .pixel-btn:hover { background:rgba(0,240,255,0.2); box-shadow:0 0 12px rgba(0,240,255,0.3); }
    .pixel-btn-sm { padding:6px 16px; font-size:8px; margin-top:8px; opacity:0.6; }
    .pixel-btn-sm:hover { opacity:1; }
    .pixel-rewards { margin:12px 0; display:flex; flex-direction:column; gap:4px; }
    .pixel-reward-row { display:flex; justify-content:space-between; font-size:8px; padding:4px 8px; background:rgba(0,0,0,0.3); border-radius:2px; color:rgba(255,255,255,0.7); }
    .pixel-val { color:#0ff; }
    .pixel-reward-xp .pixel-val { color:#0f0; }
    .pixel-reward-ticket .pixel-val { color:#f90; }
    .pixel-reward-caught .pixel-val { color:#f0f; }
    .settings-box { max-width:600px; text-align:left; }
    .settings-box h2 { text-align:center; }
    .settings-box h3 { font-size:9px; color:rgba(0,240,255,0.8); margin:0 0 8px; text-transform:uppercase; letter-spacing:1px; }
    .settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .keybind-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid rgba(0,240,255,0.1); }
    .keybind-label { font-size:8px; color:rgba(255,255,255,0.6); }
    .keybind-btn { padding:4px 10px; background:rgba(0,240,255,0.05); border:1px solid rgba(0,240,255,0.2); color:#0ff; font-family:'Press Start 2P',monospace; font-size:7px; cursor:pointer; border-radius:3px; min-width:50px; text-align:center; transition:all 0.15s; }
    .keybind-btn:hover { border-color:rgba(0,240,255,0.5); }
    .keybind-btn.listening { background:rgba(0,240,255,0.15); border-color:#0ff; animation:pulse-border 0.8s ease-in-out infinite; }
    @keyframes pulse-border { 0%,100%{box-shadow:0 0 4px rgba(0,240,255,0.3)} 50%{box-shadow:0 0 12px rgba(0,240,255,0.6)} }
    .setting-toggle-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid rgba(0,240,255,0.1); font-size:8px; color:rgba(255,255,255,0.6); }
    .toggle-btn { padding:3px 10px; background:rgba(0,240,255,0.05); border:1px solid rgba(0,240,255,0.2); color:#0ff; font-family:'Press Start 2P',monospace; font-size:7px; cursor:pointer; border-radius:3px; transition:all 0.15s; }
    .toggle-btn:hover { border-color:rgba(0,240,255,0.5); background:rgba(0,240,255,0.1); }
    .scale-btns { display:flex; gap:6px; }
    .scale-btn { padding:4px 12px; background:rgba(0,240,255,0.05); border:1px solid rgba(0,240,255,0.2); color:rgba(0,240,255,0.5); font-family:'Press Start 2P',monospace; font-size:7px; cursor:pointer; border-radius:3px; transition:all 0.15s; }
    .scale-btn.active { background:rgba(0,240,255,0.15); border-color:#0ff; color:#0ff; }
    .scale-btn:hover { border-color:rgba(0,240,255,0.5); }
  `],
})
export class PixelGameComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly destroy$ = new Subject<void>();
  private readonly gameService = inject(PixelGameService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly close = output<void>();

  canvasW = W;
  canvasH = H;

  gameState: 'menu'|'overworld'|'battle'|'gameover' = 'menu';
  showSettings = false;
  isFullscreen = false;
  showFps = false;
  screenShake = true;
  particlesEnabled = true;
  canvasScale = 1;
  finalScore = 0;

  // Keybinds
  keyBinds: KeyBinds = { ...DEFAULT_BINDS };
  listeningKey: string | null = null;
  keybindList = [
    { key:'up' as const, label:'Move Up' },
    { key:'down' as const, label:'Move Down' },
    { key:'left' as const, label:'Move Left' },
    { key:'right' as const, label:'Move Right' },
    { key:'confirm' as const, label:'Confirm' },
    { key:'cancel' as const, label:'Cancel' },
    { key:'menu' as const, label:'Menu / Settings' },
  ];

  private ctx!: CanvasRenderingContext2D;
  private animId = 0;
  private keys = new Set<string>();
  private pX = 19;
  private pY = 4;
  private pDir = 0;
  private pFrame = 0;
  private moving = false;
  private moveProgress = 0;
  private moveFromX = 0;
  private moveFromY = 0;
  private moveToX = 0;
  private moveToY = 0;
  private moveDir = 0;
  private stepCounter = 0;
  private encounterThreshold = 0;
  private fadeAlpha = 0;
  private fading = false;
  private fadeDirection = 1;
  private moveCooldown = 0;
  private shakeX = 0;
  private shakeY = 0;
  private fps = 0;
  private frameCount = 0;
  private lastFpsTime = 0;

  stepsTaken = 0;
  enemiesKilled = 0;
  monstersCaught = 0;
  caughtList: string[] = [];

  battlePhase: 'intro'|'playerTurn'|'enemyTurn'|'won'|'lost'|'fled'|'caught' = 'intro';
  currentMonster!: Monster;
  battleLog: string[] = [];
  battleLogTimer = 0;
  playerAtk = 3;
  playerDef = 1;
  selection = 0;
  battleMenu = true;
  catchAttempts = 0;
  showCaught = false;

  rewards: any = null;
  private particles: Particle[] = [];
  private monsterDefeatedCount = 0;
  private battleResultProcessed = false;

  private battleBgDrawn = false;
  private battleBgCache: ImageData | null = null;

  readonly titleArt = `
╔═══════════════════════════╗
║  ██████╗ ██╗██╗  ██╗███████╗██╗     ██████╗ ██╗   ██╗███████╗███████╗████████╗
║  ██╔══██╗██║╚██╗██╔╝██╔════╝██║    ██╔═══██╗██║   ██║██╔════╝██╔════╝╚══██╔══╝
║  ██████╔╝██║ ╚███╔╝ █████╗  ██║    ██║   ██║██║   ██║█████╗  ███████╗   ██║
║  ██╔═══╝ ██║ ██╔██╗ ██╔══╝  ██║    ██║▄▄ ██║██║   ██║██╔══╝  ╚════██║   ██║
║  ██║     ██║██╔╝╚██╗███████╗███████╗╚██████╔╝╚██████╔╝███████╗███████║   ██║
║  ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝╚══════╝   ╚═╝
╚═══════════════════════════╝`;

  ngOnInit(): void {
    this.loadKeybinds();
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.drawMenu();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animId);
    this.destroy$.next();
    this.destroy$.complete();
    if (this.isFullscreen) document.exitFullscreen?.();
  }

  // ── Keybinds ──────────────────────────────────────────────────────────────

  loadKeybinds(): void {
    try {
      const saved = localStorage.getItem('pixel_game_keybinds');
      if (saved) this.keyBinds = { ...DEFAULT_BINDS, ...JSON.parse(saved) };
    } catch {}
  }

  saveKeybinds(): void {
    try { localStorage.setItem('pixel_game_keybinds', JSON.stringify(this.keyBinds)); } catch {}
  }

  startRebind(action: string): void {
    this.listeningKey = action;
  }

  finishRebind(key: string): void {
    if (!this.listeningKey) return;
    (this.keyBinds as any)[this.listeningKey] = key;
    this.listeningKey = null;
    this.saveKeybinds();
    this.cdr.markForCheck();
  }

  getKeyDisplay(key: string): string {
    const map: Record<string,string> = { w:'W', s:'S', a:'A', d:'D', enter:'ENTER', escape:'ESC', tab:'TAB', ' ':'SPACE', arrowup:'↑', arrowdown:'↓', arrowleft:'←', arrowright:'→' };
    return map[key] ?? key.toUpperCase();
  }

  isKeyFor(action: string, key: string): boolean {
    return this.keyBinds[action as keyof KeyBinds] === key;
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    this.cdr.markForCheck();
  }

  setScale(s: number): void {
    this.canvasScale = s;
    this.cdr.markForCheck();
  }

  // ── Game ──────────────────────────────────────────────────────────────────

  startGame(): void {
    this.pX = 19; this.pY = 4;
    this.pDir = 0; this.pFrame = 0;
    this.stepCounter = 0;
    this.encounterThreshold = 6 + Math.floor(Math.random() * 8);
    this.stepsTaken = 0;
    this.enemiesKilled = 0;
    this.monstersCaught = 0;
    this.caughtList = [];
    this.monsterDefeatedCount = 0;
    this.rewards = null;
    this.particles = [];
    this.fadeAlpha = 0;
    this.fading = true;
    this.fadeDirection = 1;
    this.battleBgDrawn = false;
    this.battleBgCache = null;
    this.gameState = 'overworld';
    this.cdr.markForCheck();
    this.canvasRef.nativeElement.focus();
    this.lastFpsTime = performance.now();
    this.frameCount = 0;
    this.gameLoop();
  }

  closeGame(): void {
    cancelAnimationFrame(this.animId);
    this.gameState = 'menu';
    this.close.emit();
  }

  // ── Game loop ─────────────────────────────────────────────────────────────

  private gameLoop(): void {
    if (this.gameState === 'overworld') {
      this.updateOverworld();
      this.drawOverworld();
      this.animId = requestAnimationFrame(() => this.gameLoop());
    } else if (this.gameState === 'battle') {
      this.updateBattle();
      this.drawBattle();
      this.animId = requestAnimationFrame(() => this.gameLoop());
    }
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }

  // ── Overworld ─────────────────────────────────────────────────────────────

  private updateOverworld(): void {
    if (this.fading) {
      this.fadeAlpha += 0.03 * this.fadeDirection;
      if (this.fadeAlpha >= 1) { this.fadeAlpha = 1; this.fading = false; this.fadeDirection = -1; }
      else if (this.fadeAlpha <= 0 && this.fadeDirection === -1) { this.fadeAlpha = 0; this.fadeDirection = 1; this.fading = false; }
      return;
    }
    if (this.moving) {
      this.moveProgress += 0.15;
      if (this.moveProgress >= 1) {
        this.moveProgress = 0;
        this.moving = false;
        this.pX = this.moveToX;
        this.pY = this.moveToY;
        this.onStep();
      }
      return;
    }
    if (this.moveCooldown > 0) { this.moveCooldown--; return; }

    let dx = 0, dy = 0;
    if (this.keys.has(this.keyBinds.up)) dy = -1;
    else if (this.keys.has(this.keyBinds.down)) dy = 1;
    else if (this.keys.has(this.keyBinds.left)) dx = -1;
    else if (this.keys.has(this.keyBinds.right)) dx = 1;

    if (dx !== 0 || dy !== 0) {
      this.pDir = dy === -1 ? 2 : dy === 1 ? 0 : dx === -1 ? 1 : 3;
      const nx = this.pX + dx;
      const ny = this.pY + dy;
      if (this.canWalk(nx, ny)) {
        this.moving = true;
        this.moveProgress = 0;
        this.moveFromX = this.pX;
        this.moveFromY = this.pY;
        this.moveToX = nx;
        this.moveToY = ny;
        this.moveDir = this.pDir;
        this.pFrame = (this.pFrame + 1) % 4;
      }
    }
  }

  private canWalk(c: number, r: number): boolean {
    if (r < 1 || r >= ROWS - 1 || c < 1 || c >= COLS - 1) return false;
    const t = MAP[r][c];
    return t !== WALL && t !== WATER && t !== TREE;
  }

  private onStep(): void {
    this.stepsTaken++;
    this.stepCounter++;
    const tile = MAP[this.pY][this.pX];
    if (tile === TALL || tile === CAVE) {
      if (this.stepCounter >= this.encounterThreshold) {
        this.stepCounter = 0;
        this.encounterThreshold = 6 + Math.floor(Math.random() * 10);
        this.triggerEncounter(tile);
        return;
      }
    }
  }

  private triggerEncounter(biome: number): void {
    const available = CHARS.filter(c => {
      if (this.monsterDefeatedCount < (c.minScore / 50)) return false;
      return c.biomes.includes(biome);
    });
    if (available.length === 0) { this.encounterThreshold = 2; return; }
    const weights = available.map((_, i) => Math.max(1, 10 - this.monsterDefeatedCount * 0.3 + i));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalW;
    let chosen = available[0];
    for (let i = 0; i < available.length; i++) { roll -= weights[i]; if (roll <= 0) { chosen = available[i]; break; } }
    this.startBattle(chosen);
  }

  // ── Battle ────────────────────────────────────────────────────────────────

  private startBattle(type: CharType): void {
    this.currentMonster = { type, hp: type.hp, maxHp: type.hp, x: 0, y: 0 };
    this.battlePhase = 'intro';
    this.battleLog = [`Wild ${type.name} appeared!`];
    this.battleLogTimer = 0;
    this.selection = 0;
    this.battleMenu = true;
    this.catchAttempts = 0;
    this.showCaught = false;
    this.battleResultProcessed = false;
    this.battleBgDrawn = false;
    this.gameState = 'battle';
    this.cdr.markForCheck();
  }

  private updateBattle(): void {
    if (this.battlePhase === 'intro') {
      this.battleLogTimer++;
      if (this.battleLogTimer > 60) { this.battlePhase = 'playerTurn'; this.battleLogTimer = 0; this.battleLog.push('What will you do?'); }
    } else if (this.battlePhase === 'enemyTurn') {
      this.battleLogTimer++;
      if (this.battleLogTimer === 30) {
        const dmg = Math.max(1, this.currentMonster.type.atk - this.playerDef + Math.floor(Math.random() * 3) - 1);
        this.playerAtk -= dmg;
        if (this.screenShake) { this.shakeX = (Math.random()-0.5)*8; this.shakeY = (Math.random()-0.5)*8; setTimeout(() => { this.shakeX=0; this.shakeY=0; }, 150); }
        this.battleLog.push(`${this.currentMonster.type.name} attacks for ${dmg} damage!`);
        this.spawnParticles(W / 2, H - 60, '#f44', 8);
        if (this.playerAtk <= 0) {
          this.playerAtk = 0;
          this.battleLog.push('You were defeated!');
          this.battleLogTimer = 0;
          this.battlePhase = 'lost';
          this.battleResultProcessed = false;
        } else {
          this.battlePhase = 'playerTurn';
          this.battleLog.push('What will you do?');
        }
        this.battleLogTimer = 0;
      }
    } else if (this.battlePhase === 'won') {
      this.battleLogTimer++;
      if (this.battleLogTimer > 90 && !this.battleResultProcessed) {
        this.battleResultProcessed = true;
        this.monsterDefeatedCount++;
        this.enemiesKilled++;
        this.endBattle();
      }
    } else if (this.battlePhase === 'lost') {
      this.battleLogTimer++;
      if (this.battleLogTimer > 90 && !this.battleResultProcessed) { this.battleResultProcessed = true; this.endRun(); }
    } else if (this.battlePhase === 'fled') {
      this.battleLogTimer++;
      if (this.battleLogTimer > 60) this.endBattle();
    } else if (this.battlePhase === 'caught') {
      this.battleLogTimer++;
      if (this.battleLogTimer > 90 && !this.battleResultProcessed) {
        this.battleResultProcessed = true;
        this.monstersCaught++;
        this.caughtList.push(this.currentMonster.type.name);
        this.spawnParticles(W / 2, H / 2, '#f0f', 20);
        this.endBattle();
      }
    }

    if ((this.battlePhase === 'playerTurn' || this.battlePhase === 'intro') && this.keys.has(this.keyBinds.confirm)) {
      this.keys.delete(this.keyBinds.confirm);
      if (this.battlePhase === 'intro') return;
      this.handleMenuSelect();
    }
    if (this.keys.has(this.keyBinds.menu) && this.gameState === 'battle') {
      this.keys.delete(this.keyBinds.menu);
      this.showSettings = !this.showSettings;
      this.cdr.markForCheck();
    }
    if (this.battlePhase === 'playerTurn') {
      if (this.keys.has(this.keyBinds.up)) { this.keys.delete(this.keyBinds.up); this.selection = (this.selection + 3) % 4; }
      if (this.keys.has(this.keyBinds.down)) { this.keys.delete(this.keyBinds.down); this.selection = (this.selection + 1) % 4; }
      if (this.keys.has(this.keyBinds.left)) { this.keys.delete(this.keyBinds.left); this.selection = this.selection >= 2 ? this.selection : this.selection + 2; }
      if (this.keys.has(this.keyBinds.right)) { this.keys.delete(this.keyBinds.right); this.selection = this.selection < 2 ? this.selection + 2 : this.selection; }
    }
  }

  private handleMenuSelect(): void {
    switch (this.selection) {
      case 0: this.playerAttack(); break;
      case 1: this.playerCatch(); break;
      case 2: this.playerFlee(); break;
      case 3: this.battleLog.push(`${this.currentMonster.type.name} [${this.currentMonster.type.title}] Lv.${Math.floor(this.monsterDefeatedCount / 2) + 1} HP:${this.currentMonster.hp}/${this.currentMonster.maxHp}`); break;
    }
  }

  private playerAttack(): void {
    const dmg = Math.max(1, this.playerAtk + Math.floor(Math.random() * 4) - this.currentMonster.type.def);
    this.currentMonster.hp -= dmg;
    if (this.screenShake) { this.shakeX = (Math.random()-0.5)*6; this.shakeY = (Math.random()-0.5)*6; setTimeout(() => { this.shakeX=0; this.shakeY=0; }, 100); }
    this.battleLog.push(`You strike for ${dmg} damage!`);
    this.spawnParticles(W / 2, 80, '#0ff', 10);
    this.battleLogTimer = 0;
    if (this.currentMonster.hp <= 0) {
      this.currentMonster.hp = 0;
      this.battleLog.push(`${this.currentMonster.type.name} was defeated!`);
      this.battlePhase = 'won';
      this.battleLogTimer = 0;
    } else {
      this.battlePhase = 'enemyTurn';
      this.battleLogTimer = 0;
    }
  }

  private playerCatch(): void {
    this.catchAttempts++;
    const rate = this.currentMonster.type.catchRate + (this.catchAttempts - 1) * 0.1;
    const roll = Math.random();
    if (roll < rate || this.currentMonster.hp <= this.currentMonster.maxHp * 0.3) {
      this.battleLog.push('Gotcha! Character caught!');
      this.showCaught = true;
      this.battlePhase = 'caught';
    } else {
      this.battleLog.push('It broke free!');
      this.battlePhase = 'enemyTurn';
    }
    this.battleLogTimer = 0;
  }

  private playerFlee(): void {
    const success = Math.random() < 0.6;
    if (success) { this.battleLog.push('Got away safely!'); this.battlePhase = 'fled'; }
    else { this.battleLog.push("Can't escape!"); this.battlePhase = 'enemyTurn'; }
    this.battleLogTimer = 0;
  }

  private endBattle(): void {
    this.playerAtk = 3;
    this.gameState = 'overworld';
    this.moveCooldown = 10;
    this.cdr.markForCheck();
  }

  private endRun(): void {
    this.finalScore = this.enemiesKilled * 50 + this.monstersCaught * 100 + this.stepsTaken;
    this.gameState = 'gameover';
    this.cdr.markForCheck();
    this.gameService.endRun({
      score: this.finalScore,
      enemiesKilled: this.enemiesKilled,
      gemsCollected: this.monstersCaught,
      monstersCaught: this.caughtList,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => { this.rewards = res; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  // ── Drawing: menu ─────────────────────────────────────────────────────────

  private drawMenu(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r+c)%2===0 ? '#0f0f1a' : '#12121f';
      ctx.fillRect(c*TILE, r*TILE, TILE, TILE);
    }
  }

  // ── Drawing: overworld ────────────────────────────────────────────────────

  private drawOverworld(): void {
    const ctx = this.ctx;
    const camX = this.pX * TILE + TILE/2 - W/2;
    const camY = this.pY * TILE + TILE/2 - H/2;

    ctx.save();
    ctx.translate(-camX + this.shakeX, -camY + this.shakeY);

    const startC = Math.max(0, Math.floor(camX / TILE) - 1);
    const endC = Math.min(COLS, Math.ceil((camX + W) / TILE) + 1);
    const startR = Math.max(0, Math.floor(camY / TILE) - 1);
    const endR = Math.min(ROWS, Math.ceil((camY + H) / TILE) + 1);

    for (let r = startR; r < endR; r++) {
      for (let c = startC; c < endC; c++) {
        const x = c * TILE, y = r * TILE;
        const tile = MAP[r][c];
        this.drawTile(x, y, tile, r, c);
      }
    }

    this.drawPlayer(camX, camY);

    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
      ctx.globalAlpha = p.life / 20;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter(p => p.life > 0);

    ctx.restore();
    this.drawOverworldHUD();
  }

  private drawTile(x: number, y: number, tile: number, r: number, c: number): void {
    const ctx = this.ctx;
    const isAlt = (r + c) % 2 === 0;

    switch (tile) {
      case WALL: {
        if (r > 0 && r < ROWS-1 && c > 0 && c < COLS-1) {
          ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x+1, y+1, TILE-2, 2);
          ctx.fillStyle = '#2a1a0a'; ctx.fillRect(x+2, y+4, TILE-4, 1);
          ctx.fillRect(x+4, y+6, 2, 2); ctx.fillRect(x+TILE-6, y+6, 2, 2);
          ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x-2, y-3, TILE+4, 4);
          ctx.fillStyle = '#6a4a3a'; ctx.fillRect(x, y-2, TILE, 2);
          // Window
          ctx.fillStyle = '#ffe066'; ctx.fillRect(x+8, y+10, 6, 6);
          ctx.fillStyle = '#333'; ctx.fillRect(x+10, y+10, 2, 6); ctx.fillRect(x+8, y+12, 6, 2);
        } else {
          const colors = BIOME_COLORS[tile] ?? BIOME_COLORS[WALL];
          ctx.fillStyle = isAlt ? colors.fill : colors.alt;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#2a2a4e';
          ctx.fillRect(x+2, y+2, 4, 4); ctx.fillRect(x+TILE/2, y+2, 4, 4);
        }
        break;
      }
      case TREE: {
        ctx.fillStyle = '#1a3a1a'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#1a5a1a';
        ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2-2, TILE/2-2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#0a3a0a';
        ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, TILE/3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a6a2a';
        ctx.beginPath(); ctx.arc(x+TILE/2-3, y+TILE/2-4, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(x+TILE/2-2, y+TILE/2+4, 4, TILE/2-4);
        break;
      }
      case TALL: {
        ctx.fillStyle = isAlt ? '#2a6b28' : '#1f5a1a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3a9a30';
        for (let i = 0; i < 5; i++) {
          const gx = x + 3 + (i * 6) + Math.sin(c + r + i) * 2;
          ctx.fillRect(gx, y + 6 + i * 2, 2, 10 - i * 2);
        }
        ctx.fillStyle = '#4ab040';
        for (let i = 0; i < 3; i++) {
          const gx = x + 8 + (i * 8) + Math.cos(c + r + i) * 2;
          ctx.fillRect(gx, y + 4 + i * 3, 1, 6);
        }
        break;
      }
      case WATER: {
        ctx.fillStyle = isAlt ? '#1a4a6b' : '#2a6b8f';
        ctx.fillRect(x, y, TILE, TILE);
        const t = Date.now() / 1000;
        ctx.fillStyle = 'rgba(100,200,255,0.15)';
        ctx.fillRect(x + Math.sin(t + c) * 4 + 4, y + 8, 12, 2);
        ctx.fillRect(x + Math.cos(t + r) * 4 + 8, y + 20, 10, 2);
        ctx.fillStyle = 'rgba(200,240,255,0.1)';
        ctx.fillRect(x + Math.sin(t * 1.5 + c) * 3 + 6, y + 14, 8, 1);
        break;
      }
      case CAVE: {
        ctx.fillStyle = isAlt ? '#2a2a2a' : '#222222';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x+4, y+4, 3, 3); ctx.fillRect(x+TILE-7, y+8, 2, 2);
        ctx.fillStyle = '#333';
        ctx.fillRect(x+2, y+2, 2, 1); ctx.fillRect(x+TILE-4, y+TILE-4, 2, 1);
        break;
      }
      case BRIDGE: {
        ctx.fillStyle = '#6b5b3a'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#5a4a2a';
        ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y+TILE-2, TILE, 2);
        ctx.fillStyle = '#7a6a4a';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + i*8, y+4, 6, TILE-8);
        break;
      }
      case PATH: {
        ctx.fillStyle = isAlt ? '#8b7355' : '#7a6345';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#6b5335';
        ctx.fillRect(x+4, y+6, 3, 2); ctx.fillRect(x+TILE-8, y+TILE-10, 4, 2);
        break;
      }
      default: {
        const colors = BIOME_COLORS[tile] ?? BIOME_COLORS[_];
        ctx.fillStyle = isAlt ? colors.fill : colors.alt;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x+2, y+2, 2, 2);
        break;
      }
    }
  }

  private drawPlayer(camX: number, camY: number): void {
    const ctx = this.ctx;
    let px = this.pX * TILE + 4;
    let py = this.pY * TILE - 2;
    if (this.moving) {
      px = this.moveFromX * TILE + (this.moveToX - this.moveFromX) * TILE * this.moveProgress + 4;
      py = this.moveFromY * TILE + (this.moveToY - this.moveFromY) * TILE * this.moveProgress - 2;
    }
    const walkCycle = this.moving ? Math.sin(this.moveProgress * Math.PI * 2) * 2 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px + 2, py + TILE - 2, TILE - 8, 4);

    // Cape
    ctx.fillStyle = '#1a0b35';
    const capeWave = Math.sin(Date.now() / 200) * 1.5;
    ctx.fillRect(px + 2, py + 10, TILE - 8, TILE - 14);
    ctx.fillRect(px + 1, py + 12 + capeWave, 3, TILE - 18);
    ctx.fillRect(px + TILE - 10, py + 12 - capeWave, 3, TILE - 18);

    // Body (dark tunic)
    ctx.fillStyle = '#160930';
    ctx.fillRect(px + 4, py + 10, TILE - 12, TILE - 16);

    // Belt
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(px + 4, py + 18, TILE - 12, 2);
    ctx.fillStyle = '#daa520';
    ctx.fillRect(px + TILE/2 - 1, py + 18, 3, 2);

    // Hood
    ctx.fillStyle = '#2e1668';
    ctx.fillRect(px + 2, py + 2, TILE - 8, 12);
    ctx.fillStyle = '#4a28a0';
    ctx.fillRect(px + 3, py + 3, TILE - 10, 4);
    ctx.fillRect(px + 5, py + 8, TILE - 14, 2);

    // Hood edge highlights
    ctx.fillStyle = '#6a38c0';
    ctx.fillRect(px + 2, py + 2, 1, 10);
    ctx.fillRect(px + TILE - 11, py + 2, 1, 10);

    // Visor
    ctx.fillStyle = '#06030c';
    ctx.fillRect(px + 6, py + 6, TILE - 16, 5);
    ctx.fillStyle = '#4a30a8';
    ctx.fillRect(px + 8, py + 7, TILE - 20, 1);

    // Eyes (direction-aware)
    ctx.fillStyle = '#f0c0ff';
    const eyeOff = this.pDir === 1 ? -1 : this.pDir === 3 ? 1 : 0;
    ctx.fillRect(px + 7 + eyeOff, py + 8, 3, 2);
    ctx.fillRect(px + TILE - 14 + eyeOff, py + 8, 3, 2);
    ctx.fillStyle = '#dd99ff';
    ctx.fillRect(px + 8 + eyeOff, py + 9, 1, 1);
    ctx.fillRect(px + TILE - 13 + eyeOff, py + 9, 1, 1);

    // Pink A emblem on hood
    ctx.fillStyle = '#cc55dd';
    ctx.fillRect(px + TILE/2 - 1, py + 4, 2, 3);
    ctx.fillRect(px + TILE/2 - 2, py + 5, 4, 1);

    // Hidden blade (on arm facing direction)
    if (this.pDir === 0 || this.pDir === 2) {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(px + TILE - 6, py + 14, 1, 4);
    }

    // Legs
    ctx.fillStyle = '#160930';
    ctx.fillRect(px + 5, py + TILE - 6, 5, 4 + walkCycle);
    ctx.fillRect(px + TILE - 14, py + TILE - 6, 5, 4 - walkCycle);

    // Boots
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(px + 4, py + TILE - 3, 6, 3);
    ctx.fillRect(px + TILE - 15, py + TILE - 3, 6, 3);

    // Arms
    ctx.fillStyle = '#1a0b35';
    ctx.fillRect(px, py + 10 + walkCycle, 4, 8);
    ctx.fillRect(px + TILE - 8, py + 10 - walkCycle, 4, 8);
    // Gauntlets
    ctx.fillStyle = '#3a1878';
    ctx.fillRect(px - 1, py + 16 + walkCycle, 5, 3);
    ctx.fillRect(px + TILE - 9, py + 16 - walkCycle, 5, 3);
  }

  private drawOverworldHUD(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 28);
    ctx.font = '10px "Press Start 2P","Share Tech Mono",monospace';
    ctx.fillStyle = '#0ff';
    ctx.fillText(`\u2726 ${this.stepsTaken}`, 10, 18);
    ctx.fillStyle = '#f44';
    ctx.fillText(`\u2694 ${this.enemiesKilled}`, 140, 18);
    ctx.fillStyle = '#f0f';
    ctx.fillText(`\u25C8 ${this.monstersCaught}`, 280, 18);

    const tile = MAP[this.pY][this.pX];
    let area = 'Route 1';
    if (tile === PATH && this.pY <= 5) area = 'Haven Town';
    else if (tile === TREE) area = 'Shadow Grove';
    else if (tile === WATER || (this.pY >= 17 && this.pY <= 19)) area = 'Crystal Lake';
    else if (tile === CAVE || this.pY >= 20) area = 'Void Cavern';
    else if (tile === TALL && this.pY <= 10) area = 'Route 1';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(area, W - ctx.measureText(area).width - 10, 18);

    if (this.showFps) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '7px "Press Start 2P",monospace';
      ctx.fillText(`${this.fps} FPS`, W - 60, 26);
    }
  }

  // ── Drawing: battle ───────────────────────────────────────────────────────

  private drawBattle(): void {
    const ctx = this.ctx;

    // Background
    const tile = MAP[this.pY][this.pX];
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (tile === CAVE) {
      bgGrad.addColorStop(0, '#0a0a12');
      bgGrad.addColorStop(0.5, '#12121a');
      bgGrad.addColorStop(1, '#1a1a22');
    } else if (tile === TREE) {
      bgGrad.addColorStop(0, '#0a1a0a');
      bgGrad.addColorStop(0.5, '#1a2a1a');
      bgGrad.addColorStop(1, '#1a3a1a');
    } else {
      bgGrad.addColorStop(0, '#0a1a2a');
      bgGrad.addColorStop(0.5, '#1a2a3a');
      bgGrad.addColorStop(1, '#1a3a2a');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Ground with perspective
    ctx.fillStyle = tile === CAVE ? '#222233' : '#2a4a2a';
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    ctx.fillStyle = tile === CAVE ? '#2a2a3a' : '#3a5a3a';
    ctx.fillRect(0, H * 0.55, W, 3);

    // Enemy platform
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(W/2 - 60, H * 0.48, 120, 8);
    ctx.fillStyle = 'rgba(0,240,255,0.05)';
    ctx.fillRect(W/2 - 50, H * 0.48 - 2, 100, 4);

    // Player platform
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(W/2 - 60, H * 0.7, 120, 8);

    // Enemy
    this.drawCharSprite(W / 2, H * 0.38, this.currentMonster, true);

    // Player
    this.drawCharSprite(W / 2, H * 0.68, null, false);

    // Battle UI
    const uiY = H - 120;

    // Battle log box
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(8, uiY, W - 170, 55);
    ctx.strokeStyle = 'rgba(0,240,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, uiY, W - 170, 55);

    ctx.font = '9px "Press Start 2P","Share Tech Mono",monospace';
    ctx.fillStyle = '#fff';
    const logText = this.battleLog.length > 0 ? this.battleLog[this.battleLog.length - 1] : '';
    ctx.fillText(logText, 16, uiY + 20);
    if (this.battleLog.length > 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '7px "Press Start 2P","Share Tech Mono",monospace';
      ctx.fillText(this.battleLog[this.battleLog.length - 2] ?? '', 16, uiY + 38);
    }

    // Menu
    if (this.battlePhase === 'playerTurn') {
      const menuX = W - 168;
      const menuY = uiY;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(menuX, menuY, 160, 110);
      ctx.strokeStyle = 'rgba(0,240,255,0.2)';
      ctx.strokeRect(menuX, menuY, 160, 110);

      const items = ['FIGHT', 'CATCH', 'RUN', 'INFO'];
      for (let i = 0; i < 4; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const mx = menuX + 10 + col * 74;
        const my = menuY + 12 + row * 44;
        if (this.selection === i) {
          ctx.fillStyle = 'rgba(0,240,255,0.15)';
          ctx.fillRect(mx - 2, my - 2, 70, 38);
          ctx.fillStyle = '#0ff';
          ctx.fillRect(mx - 4, my + 8, 2, 18);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
        }
        ctx.font = '9px "Press Start 2P","Share Tech Mono",monospace';
        ctx.fillText(items[i], mx + 4, my + 22);
      }
    }

    // Enemy HP bar
    this.drawHPBar(W - 168, 10, this.currentMonster.hp, this.currentMonster.maxHp, this.currentMonster.type.color1);
    ctx.font = '7px "Press Start 2P","Share Tech Mono",monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(this.currentMonster.type.name, W - 168, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(this.currentMonster.type.title, W - 168, 28);

    // Player HP
    const ph = Math.max(0, this.playerAtk);
    this.drawHPBar(16, H * 0.55 + 6, ph, 10, '#0ff');
    ctx.font = '7px "Press Start 2P","Share Tech Mono",monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('APEX', 16, H * 0.55 + 2);

    // Catch animation
    if (this.showCaught) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const bx = W/2 - 50, by = H*0.3;
      ctx.fillRect(bx, by, 100, 40);
      ctx.strokeStyle = '#f0f';
      ctx.strokeRect(bx, by, 100, 40);
      ctx.font = '12px "Press Start 2P","Share Tech Mono",monospace';
      ctx.fillStyle = '#f0f';
      ctx.fillText('CAUGHT!', bx + 10, by + 26);
    }

    // Particles
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
      ctx.globalAlpha = p.life / 15;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter(p => p.life > 0);
  }

  private drawCharSprite(x: number, y: number, m: Monster | null, isEnemy: boolean): void {
    const ctx = this.ctx;
    const s = 48;

    if (!m) {
      // Player character (Apex hooded figure)
      ctx.fillStyle = '#1a0b35';
      ctx.fillRect(x - s/3, y - s/4, s*2/3, s*3/4);
      ctx.fillStyle = '#2e1668';
      ctx.fillRect(x - s/3 - 2, y - s/2, s*2/3 + 4, s/3);
      ctx.fillStyle = '#4a28a0';
      ctx.fillRect(x - s/3, y - s/2 + 2, s*2/3, s/6);
      ctx.fillStyle = '#06030c';
      ctx.fillRect(x - 8, y - s/2 + 8, 16, 6);
      ctx.fillStyle = '#f0c0ff';
      ctx.fillRect(x - 6, y - s/2 + 9, 4, 4);
      ctx.fillRect(x + 2, y - s/2 + 9, 4, 4);
      ctx.fillStyle = '#cc55dd';
      ctx.fillRect(x - 1, y - s/2 + 4, 2, 4);
      ctx.fillStyle = '#160930';
      ctx.fillRect(x - 10, y + s/4, 8, s/4);
      ctx.fillRect(x + 2, y + s/4, 8, s/4);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(x - 12, y + s/2 - 4, 10, 6);
      ctx.fillRect(x + 2, y + s/2 - 4, 10, 6);
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(x + s/3, y - s/6, 2, 8);
      return;
    }

    const t = m.type;
    ctx.shadowColor = t.color1;
    ctx.shadowBlur = 15;

    switch (t.id) {
      case 'assassin': {
        // Hooded dark figure with red accents
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x - s/4, y - s/6, s/2, s*2/3);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - s/4 - 1, y - s/6, 2, s*2/3);
        ctx.fillRect(x + s/4 - 1, y - s/6, 2, s*2/3);
        ctx.fillStyle = '#0a0a14';
        ctx.beginPath(); ctx.arc(x, y - s/6, s/4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - 1, y - s/3, 2, 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - s/4, 4, 3);
        ctx.fillRect(x + 1, y - s/4, 4, 3);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - 4, y - s/4 + 1, 2, 1);
        ctx.fillRect(x + 2, y - s/4 + 1, 2, 1);
        // Hidden blade
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(x + s/3, y, 2, 10);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + s/3, y, 2, 2);
        break;
      }
      case 'knight': {
        // Armored warrior
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(x - s/4, y - s/6, s/2, s*2/3);
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(x - s/4 + 2, y - s/6 + 2, s/2 - 4, 4);
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(x - 2, y - s/3 - 2, 4, 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - s/4, 4, 3);
        ctx.fillRect(x + 1, y - s/4, 4, 3);
        ctx.fillStyle = '#3498db';
        ctx.fillRect(x - 4, y - s/4 + 1, 2, 1);
        ctx.fillRect(x + 2, y - s/4 + 1, 2, 1);
        // Shield
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(x - s/3 - 2, y - s/6, 10, s/3);
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(x - s/3 + 1, y - s/6 + s/6 - 2, 4, 4);
        // Sword
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(x + s/3, y - s/4, 3, s/2);
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(x + s/3 - 1, y + s/6, 5, 3);
        break;
      }
      case 'mage': {
        // Robed figure with staff
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(x - s/4, y - s/8, s/2, s*3/4);
        ctx.fillStyle = '#6c3483';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(x - 3, y - s/3 - 4, 6, 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - s/4, 4, 3);
        ctx.fillRect(x + 1, y - s/4, 4, 3);
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(x - 4, y - s/4 + 1, 2, 1);
        ctx.fillRect(x + 2, y - s/4 + 1, 2, 1);
        // Staff
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(x + s/3, y - s/2, 3, s);
        ctx.fillStyle = '#2980b9';
        ctx.beginPath(); ctx.arc(x + s/3 + 1, y - s/2, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + s/3 + 1, y - s/2, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'rogue': {
        // Dual wielding dark figure
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(x - s/4, y - s/8, s/2, s*3/4);
        ctx.fillStyle = '#1a252f';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - 3, y - s/3, 6, 3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - s/4, 4, 3);
        ctx.fillRect(x + 1, y - s/4, 4, 3);
        // Daggers
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(x - s/3, y - s/8, 2, 10);
        ctx.fillRect(x + s/3 - 2, y - s/8, 2, 10);
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(x - s/3 - 1, y - s/8 - 1, 4, 2);
        ctx.fillRect(x + s/3 - 3, y - s/8 - 1, 4, 2);
        break;
      }
      case 'berserker': {
        // Large muscular figure
        ctx.fillStyle = '#922b21';
        ctx.fillRect(x - s/3, y - s/6, s*2/3, s*2/3);
        ctx.fillStyle = '#7b241c';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f5b7b1';
        ctx.fillRect(x - 3, y - s/3, 6, 3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 6, y - s/4, 5, 4);
        ctx.fillRect(x + 1, y - s/4, 5, 4);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - 5, y - s/4 + 1, 3, 2);
        ctx.fillRect(x + 2, y - s/4 + 1, 3, 2);
        // Axes
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(x - s/2, y - s/4, 3, s/2);
        ctx.fillRect(x + s/2 - 3, y - s/4, 3, s/2);
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(x - s/2 - 6, y - s/4, 12, 6);
        ctx.fillRect(x + s/2 - 6, y - s/4, 12, 6);
        break;
      }
      case 'paladin': {
        // Holy warrior with heavy armor
        ctx.fillStyle = '#f0e68c';
        ctx.fillRect(x - s/4, y - s/6, s/2, s*2/3);
        ctx.fillStyle = '#daa520';
        ctx.fillRect(x - s/4 + 2, y - s/6 + 2, s/2 - 4, 4);
        ctx.fillStyle = '#f0e68c';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fffacd';
        ctx.fillRect(x - 2, y - s/3 - 3, 4, 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - s/4, 4, 3);
        ctx.fillRect(x + 1, y - s/4, 4, 3);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(x - 4, y - s/4 + 1, 2, 1);
        ctx.fillRect(x + 2, y - s/4 + 1, 2, 1);
        // Hammer
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(x + s/3, y - s/3, 3, s/2);
        ctx.fillStyle = '#daa520';
        ctx.fillRect(x + s/3 - 4, y - s/3, 11, 6);
        ctx.fillStyle = '#f0e68c';
        ctx.fillRect(x + s/3 - 2, y - s/3 + 1, 7, 4);
        break;
      }
      case 'nomad': {
        // Desert warrior with curved blade
        ctx.fillStyle = '#d4a574';
        ctx.fillRect(x - s/4, y - s/8, s/2, s*3/4);
        ctx.fillStyle = '#8b4513';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe4b5';
        ctx.fillRect(x - s/4 - 2, y - s/3, s/2 + 4, 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - s/4, 4, 3);
        ctx.fillRect(x + 1, y - s/4, 4, 3);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(x - 4, y - s/4 + 1, 2, 1);
        ctx.fillRect(x + 2, y - s/4 + 1, 2, 1);
        // Curved blade (scimitar)
        ctx.fillStyle = '#bdc3c7';
        ctx.beginPath();
        ctx.moveTo(x + s/3, y - s/3);
        ctx.quadraticCurveTo(x + s/2 + 4, y, x + s/3, y + s/4);
        ctx.lineTo(x + s/3 - 2, y + s/4);
        ctx.quadraticCurveTo(x + s/2, y, x + s/3 - 2, y - s/3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'techno': {
        // Cyber/glitch character
        ctx.fillStyle = '#0d0d0d';
        ctx.fillRect(x - s/4, y - s/8, s/2, s*3/4);
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath(); ctx.arc(x, y - s/4, s/5, 0, Math.PI * 2); ctx.fill();
        // Cyber visor
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(x - 8, y - s/4 + 2, 16, 4);
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x - 6, y - s/4 + 3, 4, 2);
        ctx.fillRect(x + 2, y - s/4 + 3, 4, 2);
        ctx.shadowBlur = 0;
        // Glitch lines
        const gt = Date.now() / 100;
        ctx.fillStyle = 'rgba(0,255,255,0.3)';
        ctx.fillRect(x - s/3, y + Math.sin(gt) * 4, s*2/3, 1);
        ctx.fillRect(x - s/4, y + 8 + Math.cos(gt) * 3, s/2, 1);
        // Energy core
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath(); ctx.arc(x, y + 4, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y + 4, 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      default: {
        ctx.fillStyle = t.color1;
        ctx.fillRect(x - s/2, y - s/2, s, s);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 6, y - 4, 4, 4);
        ctx.fillRect(x + 2, y - 4, 4, 4);
      }
    }
    ctx.shadowBlur = 0;
  }

  private drawHPBar(x: number, y: number, hp: number, maxHp: number, color: string): void {
    const ctx = this.ctx;
    const barW = 120, barH = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y + 10, barW, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 10, barW, barH);
    const pct = Math.max(0, hp / maxHp);
    ctx.fillStyle = pct < 0.3 ? '#f44' : pct < 0.6 ? '#ff0' : color;
    ctx.fillRect(x + 1, y + 11, (barW - 2) * pct, barH - 2);
    ctx.font = '7px "Press Start 2P","Share Tech Mono",monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${hp}/${maxHp}`, x + barW / 2 - 16, y + 18);
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    if (!this.particlesEnabled) return;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5 - 2,
        life: 15 + Math.random() * 15,
        color,
      });
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  onKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (this.listeningKey) {
      this.finishRebind(key);
      e.preventDefault();
      return;
    }
    if (this.isKeyFor('confirm', key) || this.isKeyFor('cancel', key) || this.isKeyFor('menu', key)) e.preventDefault();
    if (key === ' ') e.preventDefault();
    this.keys.add(key);
  }

  onKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keys.delete(key);
  }
}
