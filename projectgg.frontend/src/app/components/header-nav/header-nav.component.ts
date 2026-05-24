import { Component, input, output, signal, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { ThemeSelectorComponent, ThemeOption } from '../theme-selector/theme-selector.component';
import { StatusSelectorComponent, StatusOption } from '../status-selector/status-selector.component';
import { CyberDropdownComponent, DropdownItem } from '../cyber-dropdown/cyber-dropdown.component';

@Component({
  selector: 'app-header-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ThemeSelectorComponent, StatusSelectorComponent, CyberDropdownComponent],
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.scss'],
})
export class HeaderNavComponent implements OnInit, OnDestroy {
  mobileMenuOpen = false;
  private routerSub?: Subscription;
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

  profileItems: DropdownItem[] = [
    { label: 'PROFILE', icon: 'person', link: '/profile' },
    { label: 'SETTINGS', icon: 'settings', link: '/settings' },
    { label: 'ADMIN PANEL', icon: 'admin_panel_settings', link: '/admin', adminOnly: true },
    { label: 'LOGOUT', icon: 'logout', action: () => this.logout.emit() },
  ];

  constructor(private router: Router) {
    effect(() => {
      this.displayAvatar.set(this.avatarUrl() ?? '/assets/unknown.png');
    });
  }

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe(() => {
      this.mobileMenuOpen = false;
    });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  handleAvatarError(): void {
    this.displayAvatar.set('/assets/unknown.png');
  }
}
