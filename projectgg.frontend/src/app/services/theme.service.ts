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
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      root.setAttribute('data-theme', 'custom');
      root.style.setProperty('--color-primary', color);
      root.style.setProperty('--color-primary-r', String(r));
      root.style.setProperty('--color-primary-g', String(g));
      root.style.setProperty('--color-primary-b', String(b));
      root.style.setProperty('--color-accent', color);
      root.style.setProperty('--color-accent-r', String(r));
      root.style.setProperty('--color-accent-g', String(g));
      root.style.setProperty('--color-accent-b', String(b));
      root.style.setProperty('--accent-color', color);
      root.style.setProperty('--accent-color-r', String(r));
      root.style.setProperty('--accent-color-g', String(g));
      root.style.setProperty('--accent-color-b', String(b));
      root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.18)`);
      root.style.setProperty('--border-color', `rgba(${r}, ${g}, ${b}, 0.12)`);
      root.style.setProperty('--border-accent', `rgba(${r}, ${g}, ${b}, 0.25)`);
      root.style.setProperty('--text-primary', this.lighten(color, 85));
      root.style.setProperty('--glow-cyan', `0 0 10px rgba(${r}, ${g}, ${b}, 0.3), 0 0 20px rgba(${r}, ${g}, ${b}, 0.1)`);
    } else {
      root.setAttribute('data-theme', theme);
      this.clearCustom();
    }
  }

  private clearCustom(): void {
    const root = document.documentElement;
    const props = [
      '--color-primary', '--color-primary-r', '--color-primary-g', '--color-primary-b',
      '--color-accent', '--color-accent-r', '--color-accent-g', '--color-accent-b',
      '--accent-color', '--accent-color-r', '--accent-color-g', '--accent-color-b',
      '--accent-glow', '--border-color', '--border-accent', '--text-primary',
      '--glow-cyan',
    ];
    for (const p of props) root.style.removeProperty(p);
  }

  private lighten(hex: string, percent: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.min(255, r + Math.round((255 - r) * percent / 100));
    const lg = Math.min(255, g + Math.round((255 - g) * percent / 100));
    const lb = Math.min(255, b + Math.round((255 - b) * percent / 100));
    return `rgb(${lr}, ${lg}, ${lb})`;
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
