import { Component, input, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: () => void;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

@Component({
  selector: 'app-cyber-context-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="ctx-overlay" (click)="close()" (contextmenu)="$event.preventDefault(); close()"></div>
      <div class="ctx-menu" [style.left.px]="x()" [style.top.px]="y()">
        @if (headerText()) {
          <div class="ctx-header">
            <span class="ctx-header-text">{{ headerText() }}</span>
          </div>
        }
        <div class="ctx-items">
          @for (item of items(); track item.label) {
            @if (item.divider) {
              <div class="ctx-divider"></div>
            }
            <button
              class="ctx-item"
              [class.ctx-danger]="item.danger"
              [class.ctx-disabled]="item.disabled"
              [disabled]="item.disabled"
              (click)="execute(item)"
            >
              @if (item.icon) {
                <span class="ctx-item-icon material-icons">{{ item.icon }}</span>
              }
              <span class="ctx-item-label">{{ item.label }}</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .ctx-overlay { position: fixed; inset: 0; z-index: 99998; background: transparent; }
    .ctx-menu {
      position: fixed; z-index: 99999;
      min-width: 180px; max-width: 260px;
      background: rgba(5,5,8,.97);
      border: 1px solid var(--border-color);
      box-shadow: 0 8px 32px rgba(0,0,0,.8), var(--glow-cyan);
      padding: 4px 0;
      animation: ctxIn .12s ease-out;
    }
    .ctx-header { padding: 6px 14px 6px; border-bottom: 1px solid rgba(0,240,255,.08); margin-bottom: 2px; }
    .ctx-header-text { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); }
    .ctx-items { display: flex; flex-direction: column; }
    .ctx-item {
      display: flex; align-items: center; gap: 8px; padding: 7px 14px;
      background: none; border: none; font-size: 13px; color: var(--text-secondary);
      cursor: pointer; text-align: left; font-family: inherit;
      border-left: 2px solid transparent; transition: all .1s;
    }
    .ctx-item:hover:not(:disabled) { background: rgba(0,240,255,.06); color: var(--text-primary); border-left-color: var(--color-primary); }
    .ctx-item:disabled { opacity: .3; cursor: default; }
    .ctx-danger:hover:not(:disabled) { background: rgba(255,45,149,.08); color: var(--neon-red); border-left-color: var(--neon-red); }
    .ctx-item-icon { font-size: 16px; width: 16px; height: 16px; opacity: .5; }
    .ctx-divider { height: 1px; background: rgba(0,240,255,.06); margin: 3px 10px; }
    @keyframes ctxIn { from { opacity: 0; transform: scale(.95) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  `],
})
export class CyberContextMenuComponent {
  readonly x = signal(0);
  readonly y = signal(0);
  readonly visible = signal(false);
  readonly headerText = signal('');
  readonly items = input<ContextMenuItem[]>([]);

  open(e: MouseEvent, items: ContextMenuItem[], header = ''): void {
    e.preventDefault();
    e.stopPropagation();

    let x = e.clientX;
    let y = e.clientY;

    const w = 220;
    const h = Math.min(items.length * 36 + (header ? 30 : 6), 420);
    if (x + w > window.innerWidth) x = window.innerWidth - w - 8;
    if (y + h > window.innerHeight) y = window.innerHeight - h - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    this.x.set(x);
    this.y.set(y);
    this.headerText.set(header);
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }

  execute(item: ContextMenuItem): void {
    if (item.disabled) return;
    this.close();
    item.action();
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.visible()) this.close();
  }
}
