import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TasksService, Task } from '../../services/tasks.service';
import { HeaderNavComponent } from '../../components/header-nav/header-nav.component';
import { ThemeOption } from '../../components/theme-selector/theme-selector.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCardModule, HeaderNavComponent],
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss'],
})
export class TasksComponent implements OnInit {
  currentUser: any = null;
  currentTheme: ThemeOption = 'green';
  currentStatus: 'online' | 'away' | 'offline' | 'invisible' = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;

  availableTasks: Task[] = [];
  completedTaskIds: Set<number> = new Set();
  loading = true;
  completingId: number | null = null;
  completeMsg: string | null = null;

  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly auth: AuthService,
    private readonly tasksService: TasksService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.applySavedTheme();
    this.applySavedStatus();
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    this.tasksService.getAvailable().subscribe({
      next: (tasks) => {
        this.availableTasks = tasks;
        this.loadCompleted();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private loadCompleted(): void {
    this.tasksService.getCompleted().subscribe({
      next: (completed) => {
        this.completedTaskIds = new Set(completed.map(c => c.task_id));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  completeTask(taskId: number): void {
    if (this.completingId !== null) return;
    this.completingId = taskId;
    this.completeMsg = null;
    this.tasksService.completeTask(taskId).subscribe({
      next: (res) => {
        this.completingId = null;
        if (res.success) {
          this.completedTaskIds.add(taskId);
          this.completeMsg = `Earned +${res.xp_awarded} XP`;
          this.availableTasks = this.availableTasks.filter(t => t.id !== taskId);
        }
        this.cdr.markForCheck();
        setTimeout(() => { this.completeMsg = null; this.cdr.markForCheck(); }, 3000);
      },
      error: () => { this.completingId = null; this.cdr.markForCheck(); },
    });
  }

  decodeCriteria(criteria: any): string {
    if (!criteria) return '';
    return JSON.stringify(criteria);
  }

  setTheme(theme: ThemeOption): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('projectgg:theme', theme);
  }

  private applySavedTheme(): void {
    try {
      const saved = localStorage.getItem('projectgg:theme') as ThemeOption | null;
      if (saved === 'red' || saved === 'yellow' || saved === 'blue' || saved === 'green') {
        this.setTheme(saved);
      } else {
        this.setTheme('green');
      }
    } catch { this.setTheme('green'); }
  }

  toggleThemeDropdown(): void {
    this.themeDropdownOpen = !this.themeDropdownOpen;
    this.statusDropdownOpen = false;
    this.profileDropdownOpen = false;
  }

  setStatus(status: 'online' | 'away' | 'offline' | 'invisible'): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    localStorage.setItem('projectgg:status', status);
  }

  private applySavedStatus(): void {
    try {
      const saved = localStorage.getItem('projectgg:status') as any;
      if (['online', 'away', 'offline', 'invisible'].includes(saved)) this.currentStatus = saved;
    } catch {}
  }

  toggleStatusDropdown(): void {
    this.statusDropdownOpen = !this.statusDropdownOpen;
    this.themeDropdownOpen = false;
    this.profileDropdownOpen = false;
  }

  toggleProfileDropdown(): void {
    this.profileDropdownOpen = !this.profileDropdownOpen;
    this.themeDropdownOpen = false;
    this.statusDropdownOpen = false;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }
}
