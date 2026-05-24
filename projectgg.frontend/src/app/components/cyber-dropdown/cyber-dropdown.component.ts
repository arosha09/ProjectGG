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
  @Output() itemSelect = new EventEmitter<DropdownItem>();

  selectItem(item: DropdownItem) {
    if (item.action) item.action();
    this.itemSelect.emit(item);
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  get genderLabel(): string | null {
    return this.userName;
  }
}
