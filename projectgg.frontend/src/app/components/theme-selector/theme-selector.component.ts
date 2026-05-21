import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ThemeOption = 'green' | 'red' | 'yellow' | 'blue';

@Component({
  selector: 'app-theme-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './theme-selector.component.html',
  styleUrls: ['./theme-selector.component.scss'],
})
export class ThemeSelectorComponent {
  readonly currentTheme = input.required<ThemeOption>();
  readonly isOpen = input(false);
  readonly themeChange = output<ThemeOption>();
  readonly toggle = output<void>();

  readonly themes: { key: ThemeOption; color: string }[] = [
    { key: 'green', color: '#00ff99' },
    { key: 'red', color: '#ff5f6d' },
    { key: 'yellow', color: '#ffd24d' },
    { key: 'blue', color: '#5fb6ff' },
  ];

  getColor(theme: ThemeOption): string {
    return this.themes.find(t => t.key === theme)?.color ?? '#00ff99';
  }

  select(theme: ThemeOption): void {
    this.themeChange.emit(theme);
  }
}
