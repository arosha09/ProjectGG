import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ChatService } from './chat.service';
import { AuthService } from './auth.service';
import { TasksService, Task } from './tasks.service';
import { StatusNotificationService } from './notification.service';

export interface TaskUpdateEvent {
  type: 'progress' | 'completed' | 'achievement-bump';
  taskId?: number;
  taskKind?: 'duration' | 'achievement' | 'test';
  currentProgress?: number;
  targetProgress?: number;
  progressPercent?: number;
  taskTitle?: string;
  claimsCount?: number;
  maxClaims?: number | null;
  hint?: 'cards_collected' | 'cards_favorited';
}

export interface TaskCompletedEvent {
  userId: string;
  taskId: number;
  taskTitle: string;
  xpAwarded: number;
}

/**
 * Always-on realtime task tracker.
 *
 * Listens to `task-update` and `task-completed` socket events so the
 * progress bars and toasts stay accurate anywhere in the app — not
 * just on the /tasks page.
 *
 * Two output streams:
 *  - `taskUpdates$` — every progress/completion change
 *  - `taskCompletions$` — only completion events (for toasts)
 *
 * The service is providerIn: 'root' so it bootstraps as soon as the
 * app starts. It defers socket setup until the user is logged in
 * (currentUser$ emits a non-null value).
 */
@Injectable({ providedIn: 'root' })
export class TaskTrackerService implements OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly auth = inject(AuthService);
  private readonly tasksService = inject(TasksService);
  private readonly status = inject(StatusNotificationService);

  private readonly taskUpdatesSubject = new Subject<TaskUpdateEvent>();
  private readonly taskCompletionsSubject = new Subject<TaskCompletedEvent>();
  /** Cached available tasks so any component can subscribe synchronously. */
  private readonly availableTasksSubject = new BehaviorSubject<Task[]>([]);

  readonly taskUpdates$ = this.taskUpdatesSubject.asObservable();
  readonly taskCompletions$ = this.taskCompletionsSubject.asObservable();
  readonly availableTasks$ = this.availableTasksSubject.asObservable();

  private socketListenersAttached = false;
  private currentUserId: string | null = null;

  get availableTasks(): Task[] {
    return this.availableTasksSubject.value;
  }

  initialize(): void {
    if (this.currentUserId) return;

    this.auth.currentUser$.subscribe((user) => {
      if (!user) {
        this.currentUserId = null;
        this.availableTasksSubject.next([]);
        return;
      }

      this.currentUserId = user.id;
      this.attachSocketListeners();
      this.refreshAvailableTasks();
    });
  }

  /**
   * Pull the latest available tasks from the backend. Components can
   * call this on entry to the /tasks page; the service emits the new
   * value through availableTasks$ for everyone else to read.
   */
  refreshAvailableTasks(): void {
    if (!this.currentUserId) return;
    this.tasksService.getAvailableWithProgress().subscribe({
      next: (tasks) => this.availableTasksSubject.next(tasks || []),
      error: () => {},
    });
  }

  private attachSocketListeners(): void {
    if (this.socketListenersAttached) return;
    this.socketListenersAttached = true;

    const socket = this.chatService.connect();

    socket.on('task-update', (payload: TaskUpdateEvent) => {
      this.handleTaskUpdate(payload);
    });

    socket.on('task-completed', (payload: TaskCompletedEvent) => {
      this.handleTaskCompleted(payload);
    });
  }

  private handleTaskUpdate(payload: TaskUpdateEvent): void {
    if (!payload) return;
    this.taskUpdatesSubject.next(payload);

    switch (payload.type) {
      case 'progress':
        // Update the in-memory cache so any page shows the new progress
        this.patchTaskInCache(payload.taskId!, (t) => ({
          ...t,
          current_progress: payload.currentProgress ?? t.current_progress,
          target_progress: payload.targetProgress ?? t.target_progress,
          progress_percent: payload.progressPercent ?? t.progress_percent,
          elapsed_seconds: payload.currentProgress ?? t.elapsed_seconds,
        }));
        break;

      case 'completed':
        // Drop the task from the available list (or bump claims_count
        // for repeatable tasks).
        this.patchTaskInCache(payload.taskId!, (t) => {
          const claims = (t.claims_count ?? 0) + 1;
          if (payload.maxClaims && claims < payload.maxClaims) {
            return { ...t, claims_count: claims };
          }
          return null; // signal removal
        });
        break;

      case 'achievement-bump':
        // The cards_collected or cards_favorited counter changed —
        // re-fetch achievement task progress.
        this.refreshAvailableTasks();
        break;
    }
  }

  private handleTaskCompleted(payload: TaskCompletedEvent): void {
    if (!payload) return;
    this.taskCompletionsSubject.next(payload);

    // Only show toast for the current user
    if (payload.userId !== this.currentUserId) return;

    const xpPart = payload.xpAwarded ? ` (+${payload.xpAwarded} XP)` : '';
    this.status.show(`Task completed: ${payload.taskTitle}${xpPart}`, 'success', 4000);
  }

  private patchTaskInCache(taskId: number, patcher: (t: Task) => Task | null): void {
    const current = this.availableTasksSubject.value;
    const next: Task[] = [];
    for (const t of current) {
      if (t.id !== taskId) {
        next.push(t);
        continue;
      }
      const patched = patcher(t);
      if (patched) next.push(patched);
    }
    if (next.length !== current.length || next.some((t, i) => t !== current[i])) {
      this.availableTasksSubject.next(next);
    }
  }

  ngOnDestroy(): void {
    // ProviderIn root lives for the app lifetime; nothing to clean up.
  }
}
