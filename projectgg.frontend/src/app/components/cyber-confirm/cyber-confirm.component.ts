import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-cyber-confirm',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="gg-overlay" (click)="cancel.emit()">
      <div class="gg-modal gg-modal-sm" (click)="$event.stopPropagation()">
        <div class="gg-confirm-icon">
          <mat-icon svgIcon="warning"></mat-icon>
        </div>

        <p class="gg-confirm-message">{{ message }}</p>

        <div class="gg-modal-actions">
          @if (showCancel) {
            <button type="button" class="gg-btn gg-btn-cancel" (click)="cancel.emit()">
              {{ cancelLabel }}
            </button>
          }

          <button type="button" class="gg-btn gg-btn-danger" (click)="confirm.emit()">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gg-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }

    .gg-modal {
      background: var(--bg-black);
      border: 1px solid var(--border-color);
      padding: 24px;
      border-radius: 12px;
      width: 100%;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    }

    .gg-modal-sm {
      max-width: 360px;
      text-align: center;
    }

    .gg-confirm-icon {
      margin-bottom: 16px;
    }

    .gg-confirm-icon mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--color-primary);
    }

    .gg-confirm-message {
      font-size: 15px;
      color: var(--text-primary);
      margin: 0 0 24px;
      line-height: 1.4;
    }

    .gg-modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .gg-btn {
      min-width: 110px;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      border: none;
      font-family: inherit;
      transition: all 0.2s;
    }

    .gg-btn-cancel {
      background: var(--border-subtle);
      color: var(--text-primary);
    }

    .gg-btn-danger {
      background: var(--bg-danger);
      color: var(--bg-black);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 12px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
    }

    .gg-btn:hover {
      filter: brightness(1.2);
    }
  `]
})
export class CyberConfirmComponent {
  @Input() message = '';
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() showCancel = true;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}

