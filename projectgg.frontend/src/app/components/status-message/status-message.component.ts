import { Component, input, output, ChangeDetectionStrategy, effect, OnDestroy } from '@angular/core';

export type StatusType = 'success' | 'error' | 'warning';

@Component({
  selector: 'app-status-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './status-message.component.html',
  styleUrl: './status-message.component.scss',
})
export class StatusMessageComponent implements OnDestroy {
  readonly type = input.required<StatusType>();
  readonly message = input.required<string>();
  readonly dismissible = input(false);
  readonly dismiss = output<void>();

  private hideTimer: any = null;

  constructor() {
    effect(() => {
      const msg = this.message();
      clearTimeout(this.hideTimer);
      if (msg) {
        this.hideTimer = setTimeout(() => {
          this.dismiss.emit();
        }, 4000);
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.hideTimer);
  }
}
