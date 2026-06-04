import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { TasksService, Task, CollectionStats } from '../../services/tasks.service';
import { TaskTrackerService, TaskUpdateEvent, TaskCompletedEvent } from '../../services/task-tracker.service';
import { ThemeOption } from '../../components/theme-selector/theme-selector.component';
import { ThemeService } from '../../services/theme.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { UserStatusService, UserStatus } from '../../services/user-status.service';
import { ChatService } from '../../services/chat.service';
import { io, Socket } from 'socket.io-client';
import { takeWhile } from 'rxjs/operators';

type TaskTab = 'daily' | 'achievements' | 'duration' | 'test' | 'completed';

interface AchievementCategory {
  category: string;
  tasks: Task[];
}

@Component({
  selector: 'app-tasks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatCardModule, MatTabsModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss'],
})
export class TasksComponent implements OnInit, OnDestroy {
  currentUser: any = null;
  currentTheme: ThemeOption = 'green';
  currentStatus: UserStatus = 'online';
  themeDropdownOpen = false;
  statusDropdownOpen = false;
  profileDropdownOpen = false;

  activeTab: TaskTab = 'daily';
  
  dailyTasks: Task[] = [];
  achievementCategories: AchievementCategory[] = [];
  collapsedCategories = new Set<string>();
  durationTasks: Task[] = [];
  testTasks: Task[] = [];
  completedTasks: any[] = [];
  
  loading = true;
  completingId: number | null = null;
  completeMsg: string | null = null;
  autoChecking = false;
  
  collectionStats: CollectionStats | null = null;
  collectedCards: any[] = [];
  
  private socket: Socket | null = null;
  private heartbeatSub: Subscription | null = null;
  private durationInterval: Subscription | null = null;
  private autoCheckInterval: Subscription | null = null;
  private taskTrackerSub: Subscription | null = null;
  private taskTrackerCompletionSub: Subscription | null = null;
  private readonly apiUrl = environment.apiUrl;
  private connectedDurationTasks = new Map<number, number>();

  constructor(
    private readonly auth: AuthService,
    private readonly tasksService: TasksService,
    private readonly chatService: ChatService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly http: HttpClient,
    private readonly userStatus: UserStatusService,
    private readonly taskTracker: TaskTrackerService,
    private readonly themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.applySavedTheme();
    this.currentStatus = this.userStatus.currentStatus;
    this.userStatus.currentStatus$.pipe(takeWhile(() => !!this.currentUser)).subscribe((status) => {
      this.currentStatus = status;
      this.cdr.markForCheck();
    });
    this.subscribeToTaskTracker();
    this.loadData();
    this.initWebSocket();
    this.initRealtimeArsenal();
    this.startAutoCheck();
  }

  ngOnDestroy(): void {
    this.heartbeatSub?.unsubscribe();
    this.durationInterval?.unsubscribe();
    this.autoCheckInterval?.unsubscribe();
    this.taskTrackerSub?.unsubscribe();
    this.taskTrackerCompletionSub?.unsubscribe();
    this.socket?.disconnect();
  }

  private startAutoCheck(): void {
    this.autoCheckInterval = interval(30000).subscribe(() => {
      if (this.currentUser && !this.autoChecking) {
        this.checkAutoComplete();
      }
    });
  }

  private checkAutoComplete(): void {
    this.autoChecking = true;
    this.tasksService.checkAutoComplete().subscribe({
      next: (completed) => {
        this.autoChecking = false;
        if (completed && completed.length > 0) {
          for (const task of completed) {
            this.completeMsg = `Task auto-completed: ${task.title}`;
            this.achievementCategories = this.achievementCategories.map(cat => ({
              ...cat,
              tasks: cat.tasks.map(t => t.id === task.id ? { ...t, completed: true } : t)
            }));
          }
          setTimeout(() => { this.completeMsg = null; this.cdr.markForCheck(); }, 4000);
        }
        this.loadCompleted();
        this.cdr.markForCheck();
      },
      error: () => { this.autoChecking = false; }
    });
  }

  private subscribeToTaskTracker(): void {
    this.taskTrackerSub = this.taskTracker.taskUpdates$.subscribe((event) => {
      if (event.type === 'progress' && event.taskId) {
        this.updateTaskProgress(event.taskId, event.currentProgress ?? 0, event.progressPercent ?? 0);
      } else if (event.type === 'completed' || event.type === 'achievement-bump') {
        this.loadData();
      }
      this.cdr.markForCheck();
    });

    this.taskTrackerCompletionSub = this.taskTracker.taskCompletions$.subscribe((event) => {
      if (event.userId === this.currentUser?.id) {
        this.completeMsg = `Task completed: ${event.taskTitle}${event.xpAwarded ? ` (+${event.xpAwarded} XP)` : ''}`;
        setTimeout(() => { this.completeMsg = null; this.cdr.markForCheck(); }, 4000);
        this.loadData();
      }
      this.cdr.markForCheck();
    });
  }

  private updateTaskProgress(taskId: number, current: number, percent: number): void {
    for (const cat of this.achievementCategories) {
      const task = cat.tasks.find(t => t.id === taskId);
      if (task) {
        task.current_progress = current;
        task.progress_percent = percent;
        return;
      }
    }
    for (const task of this.durationTasks) {
      if (task.id === taskId) {
        task.elapsed_seconds = current;
        task.progress_percent = percent;
        return;
      }
    }
    for (const task of this.dailyTasks) {
      if (task.id === taskId) {
        task.current_progress = current;
        task.progress_percent = percent;
        return;
      }
    }
  }

  private initWebSocket(): void {
    const wsUrl = this.apiUrl.replace('http://', 'http://').replace(':3000/api', ':3000');
    this.socket = io(`${wsUrl}/chat`, {
      transports: ['websocket'],
      query: { userId: this.currentUser?.id ?? '' },
    });

    this.socket.on('connect', () => {
      this.startDurationTracking();
    });

    this.socket.on('disconnect', () => {
      this.stopDurationTracking();
    });

    this.socket.on('task-update', (data: any) => {
      this.handleTaskUpdate(data);
    });

    this.socket.on('arsenal-update', (data: any) => {
      this.handleArsenalUpdate(data);
    });

    this.socket.on('task-completed', (data: any) => {
      if (data.userId === this.currentUser?.id) {
        this.completeMsg = `Task completed: ${data.taskTitle}${data.xpAwarded ? ` (+${data.xpAwarded} XP)` : ''}`;
        setTimeout(() => { this.completeMsg = null; this.cdr.markForCheck(); }, 4000);
        this.loadData();
      }
      this.cdr.markForCheck();
    });
  }

  private initRealtimeArsenal(): void {
    this.tasksService.getCollectionStats().subscribe({
      next: (stats) => {
        this.collectionStats = stats;
        this.cdr.markForCheck();
      }
    });

    this.tasksService.getCollectedGames(1, 20).subscribe({
      next: (cards) => {
        this.collectedCards = cards;
        this.cdr.markForCheck();
      }
    });
  }

  private startDurationTracking(): void {
    this.durationInterval = interval(1000).subscribe(() => {
      this.updateDurationProgress();
    });
  }

  private stopDurationTracking(): void {
    this.durationInterval?.unsubscribe();
    this.durationInterval = null;
  }

  private updateDurationProgress(): void {
    const now = Date.now();
    for (const [taskId, startTime] of this.connectedDurationTasks.entries()) {
      const elapsed = Math.floor((now - startTime) / 1000);
      const task = this.durationTasks.find(t => t.id === taskId);
      if (task) {
        task.elapsed_seconds = elapsed;
        const targetSeconds = (task.duration_minutes || 30) * 60;
        task.progress_percent = Math.min(100, Math.round((elapsed / targetSeconds) * 100));
        
        if (elapsed >= targetSeconds && !task.current_progress) {
          task.current_progress = targetSeconds;
          task.progress_percent = 100;
        }
      }
    }
    this.cdr.markForCheck();
  }

  private handleTaskUpdate(data: any): void {
    const task = this.achievementCategories.flatMap(c => c.tasks).find(t => t.id === data.taskId);
    if (task && data.progress !== undefined) {
      task.current_progress = data.progress;
      task.progress_percent = data.percent;
      this.cdr.markForCheck();
    }
  }

  private handleArsenalUpdate(data: any): void {
    if (data.type === 'card_added' && this.collectionStats) {
      this.collectionStats.total_cards++;
      this.collectionStats.static_total_cards++;
      this.collectedCards.unshift(data.card);
      this.cdr.markForCheck();
    }
  }

  private loadData(): void {
    this.loading = true;
    
    this.tasksService.getAvailableWithProgress().subscribe({
      next: (tasks) => {
        this.categorizeTasks(tasks);
        this.checkAutoComplete();
        this.loadCompleted();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private categorizeTasks(tasks: Task[]): void {
    const now = new Date();
    
    this.dailyTasks = tasks.filter(t => {
      if (t.is_daily) return true;
      if (t.task_kind === 'duration' && t.start_at) {
        const start = new Date(t.start_at);
        const end = t.end_at ? new Date(t.end_at) : null;
        const isSameDay = start.toDateString() === now.toDateString() ||
                         (end && start.toDateString() === end.toDateString());
        return isSameDay || (now >= start && (!end || now <= end));
      }
      return false;
    });

    const achievementTasks = tasks.filter(t => t.task_kind === 'achievement' || t.is_achievement);
    const categoryMap = new Map<string, Task[]>();
    for (const task of achievementTasks) {
      const cat = (task as any).category || 'General';
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(task);
    }
    this.achievementCategories = Array.from(categoryMap.entries()).map(([category, tasks]) => ({
      category,
      tasks,
    }));

    this.collapsedCategories = new Set(this.achievementCategories.map(c => c.category));
    
    this.durationTasks = tasks.filter(t => t.task_kind === 'duration' && !t.is_daily);

    this.testTasks = tasks.filter(t => t.task_kind === 'test');
    
    for (const task of this.durationTasks) {
      if (!this.connectedDurationTasks.has(task.id)) {
        this.connectedDurationTasks.set(task.id, Date.now());
      }
    }
    
    this.loading = false;
    this.cdr.markForCheck();
  }

  private loadCompleted(): void {
    this.tasksService.getCompleted().subscribe({
      next: (completed) => {
        this.completedTasks = completed;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  claimTask(taskId: number, force = false): void {
    if (this.completingId !== null) return;
    
    this.completingId = taskId;
    this.completeMsg = null;
    this.tasksService.completeTask(taskId, force).subscribe({
      next: (res) => {
        this.completingId = null;
        if (res.success) {
          this.completeMsg = `Reward claimed${res.xp_awarded ? ` (+${res.xp_awarded} XP)` : ''}`;
          
          // Reload tasks instead of removing — handles repeatable tasks (max_claims > 1)
          this.loadData();
          
          setTimeout(() => { this.completeMsg = null; this.cdr.markForCheck(); }, 3000);
        }
        this.cdr.markForCheck();
      },
      error: () => { this.completingId = null; this.cdr.markForCheck(); },
    });
  }

  sendHeartbeat(taskType: string, seconds: number): void {
    this.tasksService.heartbeat(taskType, seconds).subscribe();
  }

  get tasksForCurrentTab(): Task[] {
    switch (this.activeTab) {
      case 'daily': return this.dailyTasks;
      case 'achievements': return [];
      case 'duration': return this.durationTasks;
      case 'test': return this.testTasks;
      case 'completed': return [];
      default: return [];
    }
  }

  get completedTasksForDisplay(): any[] {
    return this.completedTasks;
  }

  isTaskReadyToClaim(task: Task): boolean {
    if (this.isTaskCompleted(task)) return false;
    if (task.max_claims && task.claims_count !== undefined && task.claims_count >= task.max_claims) return false;
    if (task.task_kind === 'duration' || task.task_kind === 'test') {
      const elapsed = task.elapsed_seconds || 0;
      const required = (task.duration_minutes || 30) * 60;
      return elapsed >= required;
    }
    return this.progressPercent(task) >= 100;
  }

  isTaskCompleted(task: Task): boolean {
    return !!(task as any).completed;
  }

  decodeCriteria(criteria: any): string {
    if (!criteria) return '';
    return JSON.stringify(criteria);
  }

  isAchievement(task: Task): boolean {
    return task.task_kind === 'achievement' || !!task.is_achievement;
  }

  isDuration(task: Task): boolean {
    return task.task_kind === 'duration' || task.task_kind === 'test';
  }

  progressPercent(task: Task): number {
    if ((task.task_kind === 'duration' || task.task_kind === 'test') && task.elapsed_seconds !== undefined) {
      const targetSeconds = (task.duration_minutes || 30) * 60;
      return Math.min(100, Math.round((task.elapsed_seconds / targetSeconds) * 100));
    }
    return Number(task.progress_percent ?? 0);
  }

  progressLabel(task: Task): string {
    if (this.isDuration(task)) {
      const elapsed = task.elapsed_seconds || 0;
      const total = (task.duration_minutes || 30) * 60;
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      return `${mins}:${secs.toString().padStart(2, '0')} / ${task.duration_minutes || 30}:00`;
    }
    if (!this.isAchievement(task)) return '';
    const current = Number(task.current_progress ?? 0);
    const target = Number(task.target_progress ?? 0);
    return `${current}/${target}`;
  }

  toggleCategory(category: string): void {
    if (this.collapsedCategories.has(category)) {
      this.collapsedCategories.delete(category);
    } else {
      this.collapsedCategories.add(category);
    }
  }

  isCategoryCollapsed(category: string): boolean {
    return this.collapsedCategories.has(category);
  }

  setTheme(theme: ThemeOption): void {
    this.currentTheme = theme;
    this.themeDropdownOpen = false;
    this.themeService.setTheme(theme);
  }

  private applySavedTheme(): void {
    const saved = this.themeService.currentTheme();
    this.currentTheme = saved;
  }

  toggleThemeDropdown(): void {
    this.themeDropdownOpen = !this.themeDropdownOpen;
    this.statusDropdownOpen = false;
    this.profileDropdownOpen = false;
  }

  setStatus(status: UserStatus): void {
    this.currentStatus = status;
    this.statusDropdownOpen = false;
    this.userStatus.setStatus(status);
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const themeEl = document.querySelector('app-theme-selector');
    const statusEl = document.querySelector('app-status-selector');
    const navEl = document.querySelector('app-header-nav');

    if (themeEl && !themeEl.contains(target)) this.themeDropdownOpen = false;
    if (statusEl && !statusEl.contains(target)) this.statusDropdownOpen = false;
    if (navEl && !navEl.contains(target)) this.profileDropdownOpen = false;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/home']);
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get isDev(): boolean {
    return this.currentUser?.role === 'dev';
  }

  get canManualComplete(): boolean {
    return this.isAdmin || this.isDev;
  }
}