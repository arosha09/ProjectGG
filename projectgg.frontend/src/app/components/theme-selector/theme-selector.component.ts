import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type ThemeOption = 'green' | 'red' | 'yellow' | 'blue' | 'custom';

@Component({
  selector: 'app-theme-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './theme-selector.component.html',
  styleUrls: ['./theme-selector.component.scss'],
})
export class ThemeSelectorComponent {
  readonly currentTheme = input.required<ThemeOption>();
  readonly customColor = input('#00f0ff');
  readonly isOpen = input(false);
  readonly themeChange = output<ThemeOption>();
  readonly customColorChange = output<string>();
  readonly toggle = output<void>();

  readonly themes: { key: ThemeOption; color: string }[] = [
    { key: 'green', color: '#00ff88' },
    { key: 'red', color: '#ff5f6d' },
    { key: 'yellow', color: '#ffd24d' },
    { key: 'blue', color: '#5fb6ff' },
    { key: 'custom', color: '' },
  ];

  getColor(theme: ThemeOption): string {
    if (theme === 'custom') return this.customColor();
    return this.themes.find(t => t.key === theme)?.color ?? '#00f0ff';
  }

  select(theme: ThemeOption): void {
    this.themeChange.emit(theme);
  }

  onColorInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.customColorChange.emit(input.value);
  }
}
