import { Injectable, signal } from '@angular/core';
import { ThemeOption } from '../components/theme-selector/theme-selector.component';

const STORAGE_THEME = 'projectgg_theme';
const STORAGE_CUSTOM = 'projectgg_theme_custom';
const LEGACY_STORAGE_THEME = 'projectgg:theme';
const DEFAULT_THEME: ThemeOption = 'green';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly currentTheme = signal<ThemeOption>(DEFAULT_THEME);
  readonly customColor = signal('#00f0ff');

  constructor() {
    this.load();
  }

  setTheme(theme: ThemeOption): void {
    this.currentTheme.set(theme);
    this.apply();
    this.save();
    try { localStorage.setItem(LEGACY_STORAGE_THEME, theme); } catch {}
  }

  setCustomColor(color: string): void {
    this.customColor.set(color);
    if (this.currentTheme() === 'custom') {
      this.apply();
    }
    this.save();
  }

  private apply(): void {
    const theme = this.currentTheme();
    const root = document.documentElement;

    if (theme === 'custom') {
      const color = this.customColor();
      root.setAttribute('data-theme', 'custom');
      root.style.setProperty('--color-primary', color);
      root.style.setProperty('--accent-color', color);
      root.style.setProperty('--glow-cyan', `0 0 10px ${color}4d, 0 0 20px ${color}1a`);
    } else {
      root.setAttribute('data-theme', theme);
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--accent-color');
      root.style.removeProperty('--glow-cyan');
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_THEME, this.currentTheme());
      localStorage.setItem(STORAGE_CUSTOM, this.customColor());
    } catch {}
  }

  private load(): void {
    try {
      let saved = localStorage.getItem(STORAGE_THEME);
      // Fallback to legacy key so theme set from Dashboard/Profile/etc carries over
      if (!saved) {
        saved = localStorage.getItem(LEGACY_STORAGE_THEME);
      }
      const custom = localStorage.getItem(STORAGE_CUSTOM);
      
      if (saved) {
        this.currentTheme.set(saved as ThemeOption);
      }
      if (custom) {
        this.customColor.set(custom);
      }
      this.apply();
    } catch (e) {
      console.error('ThemeService: Load failed', e);
    }
  }
}
