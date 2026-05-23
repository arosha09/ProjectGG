import { Component, input, output, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ThemeSelectorComponent, ThemeOption } from '../theme-selector/theme-selector.component';
import { StatusSelectorComponent, StatusOption } from '../status-selector/status-selector.component';

@Component({
  selector: 'app-header-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ThemeSelectorComponent, StatusSelectorComponent],
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.scss'],
})
export class HeaderNavComponent {
  readonly currentTheme = input.required<ThemeOption>();
  readonly currentStatus = input.required<StatusOption>();
  readonly themeDropdownOpen = input(false);
  readonly statusDropdownOpen = input(false);
  readonly profileDropdownOpen = input(false);
  readonly userName = input<string | null>(null);
  readonly avatarUrl = input<string | null>(null);
  readonly isAdmin = input(false);

  readonly themeChange = output<ThemeOption>();
  readonly statusChange = output<StatusOption>();
  readonly themeToggle = output<void>();
  readonly statusToggle = output<void>();
  readonly profileToggle = output<void>();
  readonly logout = output<void>();

  readonly displayAvatar = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.displayAvatar.set(this.avatarUrl() ?? '/assets/unknown.png');
    });
  }

  handleAvatarError(): void {
    this.displayAvatar.set('/assets/unknown.png');
  }
}
