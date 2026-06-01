import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-nav',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  template: `
    <header class="admin-topbar">
      <a class="admin-brand" routerLink="/dashboard">PROJECT.GG</a>
      <div class="admin-topbar-links">
        <a class="admin-nav-btn" routerLink="/dashboard">
          <mat-icon>sports_esports</mat-icon>
          <span>DASHBOARD</span>
        </a>
        <a class="admin-nav-btn" routerLink="/admin">
          <mat-icon>admin_panel_settings</mat-icon>
          <span>ADMIN PANEL</span>
        </a>
        <a class="admin-nav-btn" routerLink="/admin/tasks">
          <mat-icon>assignment</mat-icon>
          <span>TASKS</span>
        </a>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .admin-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      border-bottom: 1px solid rgba(255,34,85,.15);
      background: rgba(3,8,16,.95);
    }
    .admin-brand {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #ff2255;
      text-decoration: none;
      text-shadow: 0 0 10px rgba(255,34,85,.3);
    }
    .admin-topbar-links {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .admin-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-decoration: none;
      text-transform: uppercase;
      color: rgba(200,216,208,.5);
      border: 1px solid transparent;
      transition: all .2s;
    }
    .admin-nav-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .admin-nav-btn:hover {
      color: #ffd700;
      border-color: rgba(255,215,0,.2);
      background: rgba(255,215,0,.04);
      box-shadow: 0 0 12px rgba(255,215,0,.06);
    }
    .admin-nav-btn:first-child:hover {
      color: #aa44ff;
      border-color: rgba(170,68,255,.2);
      background: rgba(170,68,255,.04);
      box-shadow: 0 0 12px rgba(170,68,255,.06);
    }
  `],
})
export class AdminNavComponent {}
