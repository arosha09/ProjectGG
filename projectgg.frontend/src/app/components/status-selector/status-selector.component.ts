import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusOption = 'online' | 'away' | 'offline' | 'invisible';

@Component({
  selector: 'app-status-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-selector.component.html',
  styleUrls: ['./status-selector.component.scss'],
})
export class StatusSelectorComponent {
  readonly currentStatus = input.required<StatusOption>();
  readonly isOpen = input(false);
  readonly statusChange = output<StatusOption>();
  readonly toggle = output<void>();

  readonly statuses: { key: StatusOption; color: string }[] = [
    { key: 'online', color: '#00ff99' },
    { key: 'away', color: '#ffd24d' },
    { key: 'offline', color: '#d80606' },
    { key: 'invisible', color: '#6c6870' },
  ];

  select(status: StatusOption): void {
    this.statusChange.emit(status);
  }
}
