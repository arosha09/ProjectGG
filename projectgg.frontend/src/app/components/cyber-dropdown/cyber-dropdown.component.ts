import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

export interface DropdownItem {
  label: string;
  icon?: string;
  link?: string;
  action?: () => void;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-cyber-dropdown',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  templateUrl: './cyber-dropdown.component.html',
  styleUrls: ['./cyber-dropdown.component.scss']
})
export class CyberDropdownComponent {
  @Input() items: DropdownItem[] = [];
  @Input() isOpen = false;
  @Input() isAdmin = false;
  @Input() avatarUrl: string | null = null;
  @Input() userName: string | null = null;
  @Input() currentStatus: string | null = null;
  @Input() margin = '0';
  @Output() itemSelect = new EventEmitter<DropdownItem>();
  @Output() statusChange = new EventEmitter<string>();

  statusSubmenuOpen = false;

  statusOptions = [
    { id: 'online', label: 'Online', color: '#00ff88' },
    { id: 'away', label: 'Away', color: '#ffd700' },
    { id: 'dnd', label: 'Do Not Disturb', color: '#ff5f6d' },
    { id: 'invisible', label: 'Invisible', color: '#888888' },
  ];

  selectItem(item: DropdownItem) {
    if (item.action) item.action();
    this.itemSelect.emit(item);
  }

  selectStatus(status: string) {
    this.statusChange.emit(status);
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  get genderLabel(): string | null {
    return this.userName;
  }
}
