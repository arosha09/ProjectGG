import { Injectable, signal } from '@angular/core';
import { StatusType } from '../components/status-message/status-message.component';

@Injectable({
  providedIn: 'root',
})
export class StatusNotificationService {
  readonly message = signal('');
  readonly type = signal<StatusType>('success');

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, type: StatusType = 'success', duration = 3000): void {
    this.clearTimer();
    this.type.set(type);
    this.message.set(message);

    if (duration > 0) {
      this.dismissTimer = setTimeout(() => this.clear(), duration);
    }
  }

  triggerStatusMessage(message: string, duration = 3000): void {
    this.show(message, 'error', duration);
  }

  triggerThemeAlert(message: string, duration = 3000): void {
    this.triggerStatusMessage(message, duration);
  }

  clear(): void {
    this.clearTimer();
    this.message.set('');
  }

  private clearTimer(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
