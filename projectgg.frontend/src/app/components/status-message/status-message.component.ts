import { Component, input, output } from '@angular/core';

export type StatusType = 'success' | 'error';

@Component({
  selector: 'app-status-message',
  standalone: true,
  imports: [],
  templateUrl: './status-message.component.html',
  styleUrl: './status-message.component.scss',
})
export class StatusMessageComponent {
  readonly type = input.required<StatusType>();
  readonly message = input.required<string>();
  readonly dismissible = input(false);
  readonly dismiss = output<void>();
}
