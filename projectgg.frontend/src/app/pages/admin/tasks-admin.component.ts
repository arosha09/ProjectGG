import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { TasksService, Task } from '../../services/tasks.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-tasks-admin',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
  ],
  template: `
  <div class="admin-tasks">
    <div class="admin-panel-head">
      <span class="admin-panel-kicker">ADMIN</span>
      <h3>{{ editingTask ? 'Edit Task' : 'Create Task' }}</h3>
      <p>Configure reward tasks for players. XP and draw tickets are supported.</p>
    </div>

    @if (editingTask) {
      <div class="edit-actions">
        <button mat-button (click)="cancelEdit()">
          <mat-icon>close</mat-icon>
          Cancel Edit
        </button>
        <button mat-flat-button color="warn" (click)="deleteTask()">
          <mat-icon>delete</mat-icon>
          Delete Task
        </button>
      </div>
    }

    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Task Type</mat-label>
        <mat-select formControlName="task_kind">
          <mat-option value="duration">Duration</mat-option>
          <mat-option value="achievement">Achievement</mat-option>
          @if (isDevAdmin) {
            <mat-option value="test">Test</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (form.value.task_kind === 'achievement') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Achievement Type</mat-label>
          <mat-select formControlName="achievement_type">
            <mat-option value="cards_collected">Collect cards</mat-option>
            <mat-option value="cards_favorited">Favorite cards</mat-option>
            <mat-option value="messages_sent">Send messages</mat-option>
            <mat-option value="voice_minutes">Voice minutes</mat-option>
            <mat-option value="reactions">Reactions</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Achievement Target</mat-label>
          <input matInput type="number" formControlName="achievement_target" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Category (optional)</mat-label>
          <input matInput formControlName="category" placeholder="e.g., Card Collector, Social, Combat" />
          <mat-hint>Groups achievements in the Missions tab</mat-hint>
        </mat-form-field>
      }

      @if (form.value.task_kind === 'duration') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Duration (minutes)</mat-label>
          <input matInput type="number" formControlName="duration_minutes" />
        </mat-form-field>
      }

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Title</mat-label>
        <input matInput formControlName="title" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Description</mat-label>
        <textarea matInput formControlName="description"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Reward Type</mat-label>
        <mat-select formControlName="reward_type">
          <mat-option value="xp">XP</mat-option>
          <mat-option value="tickets">Draw Tickets</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Reward Amount</mat-label>
        <input matInput type="number" formControlName="reward_amount" />
      </mat-form-field>

      <div class="multi-reward-box">
        <div class="multi-reward-head">
          <span>Bonus Reward</span>
          <small>Add a second reward so this task can grant both XP and tickets.</small>
        </div>
        <div class="multi-reward-row">
          <mat-form-field appearance="outline" class="reward-type-field">
            <mat-label>Bonus Type</mat-label>
            <mat-select formControlName="bonus_reward_type">
              <mat-option value="xp">XP</mat-option>
              <mat-option value="tickets">Draw Tickets</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="reward-amount-field">
            <mat-label>Bonus Amount</mat-label>
            <input matInput type="number" formControlName="bonus_reward_amount" />
          </mat-form-field>
        </div>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Max Claims (optional)</mat-label>
        <input matInput type="number" formControlName="max_claims" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Start</mat-label>
        <input matInput [matDatepicker]="startPicker" formControlName="start_at" />
        <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
        <mat-datepicker #startPicker></mat-datepicker>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>End</mat-label>
        <input matInput [matDatepicker]="endPicker" formControlName="end_at" />
        <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
        <mat-datepicker #endPicker></mat-datepicker>
      </mat-form-field>

      <div class="toggle-row">
        <mat-slide-toggle formControlName="active">Active</mat-slide-toggle>
      </div>

      <div class="actions-row">
        <button mat-flat-button class="create-btn" type="submit" [disabled]="form.invalid">
          {{ editingTask ? 'Update Task' : 'Create Task' }}
        </button>
      </div>
    </form>

    <div class="task-list-section">
      <div class="task-list-header">
        <h3>Existing Tasks</h3>
        <span class="task-count">{{ tasks.length }} tasks</span>
      </div>

      @if (tasks.length > 0) {
        <div class="task-list">
          @for (task of tasks; track task.id) {
            <div class="task-list-item" [class.active]="task.active" (click)="editTask(task)">
              <div class="task-item-info">
                <span class="task-item-title">{{ task.title }}</span>
                <span class="task-item-meta">
                  {{ task.task_kind === 'duration' ? 'Duration' : 'Achievement' }}
                  <span class="dot">·</span>
                  @for (reward of task.rewards ?? [{ type: task.reward_type, amount: task.reward_amount }]; track reward.type + '-' + reward.amount) {
                    +{{ reward.amount }} {{ reward.type === 'tickets' ? 'Tickets' : 'XP' }}
                  }
                </span>
              </div>
              <div class="task-item-status">
                @if (task.active) {
                  <span class="status-badge active">Active</span>
                } @else {
                  <span class="status-badge inactive">Inactive</span>
                }
                <button class="edit-btn" (click)="editTask(task); $event.stopPropagation()">
                  <mat-icon>edit</mat-icon>
                </button>
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="no-tasks">No tasks created yet.</p>
      }
    </div>
  </div>
  `,
  styles: [`
    :host { display: block; }
    .admin-tasks {
      max-width: 920px;
      margin: 0 auto;
      padding: 28px 20px 40px;
      color: var(--text-primary);
    }
    .admin-panel-head {
      margin-bottom: 18px;
      padding: 18px 18px 0;
    }
    .admin-panel-kicker {
      display: inline-block;
      margin-bottom: 8px;
      color: var(--color-primary);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .admin-panel-head h3 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .admin-panel-head p {
      margin: 8px 0 0;
      color: var(--text-muted);
      font-size: 13px;
    }
    .edit-actions {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: rgba(231, 76, 60, 0.1);
      border-radius: 8px;
      border: 1px solid rgba(231, 76, 60, 0.3);
    }
    form {
      padding: 18px;
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.18);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(4,10,22,.92), rgba(6,15,30,.72));
      box-shadow: 0 14px 34px rgba(0,0,0,.35);
    }
    .full-width { width: 100%; margin-bottom: 14px; }
    .multi-reward-box {
      margin: 4px 0 14px;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.16);
      background: rgba(255,255,255,0.02);
    }
    .multi-reward-head {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-bottom: 12px;
    }
    .multi-reward-head span {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--accent-color);
    }
    .multi-reward-head small {
      color: var(--text-muted);
      font-size: 12px;
    }
    .multi-reward-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .reward-type-field,
    .reward-amount-field {
      width: 100%;
      margin-bottom: 0;
    }
    .toggle-row {
      padding: 6px 2px 14px;
    }
    .actions-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 6px;
    }
    .create-btn {
      min-width: 160px;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 72%, #fff));
      color: var(--bg-black);
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      box-shadow: 0 0 24px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.25);
    }
    .task-list-section {
      margin-top: 32px;
      padding: 18px;
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.18);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(4,10,22,.92), rgba(6,15,30,.72));
    }
    .task-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }

      .task-count {
        font-size: 12px;
        color: var(--text-muted);
      }
    }
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .task-list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.08);
        border-color: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
      }

      &.active {
        border-left: 3px solid var(--color-primary);
      }
    }
    .task-item-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .task-item-title {
      font-size: 14px;
      font-weight: 600;
    }
    .task-item-meta {
      font-size: 11px;
      color: var(--text-muted);

      .dot {
        margin: 0 4px;
      }
    }
    .task-item-status {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .status-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;

      &.active {
        background: rgba(46, 204, 113, 0.15);
        color: #2ecc71;
      }

      &.inactive {
        background: rgba(127, 140, 141, 0.15);
        color: #95a5a6;
      }
    }
    .edit-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      border-radius: 6px;
      color: var(--color-primary);
      cursor: pointer;
      transition: all 0.2s ease;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
      }
    }
    .no-tasks {
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      padding: 20px;
    }
  `]
})
export class TasksAdminComponent implements OnInit {
  form: FormGroup;
  tasks: Task[] = [];
  editingTask: Task | null = null;

  get isDevAdmin(): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    return role === 'admin' || role === 'dev' || user.is_admin === true;
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly tasksService: TasksService,
    private readonly auth: AuthService,
  ) {
    this.form = this.fb.group({
      task_kind: ['duration', Validators.required],
      achievement_type: ['cards_collected'],
      achievement_target: [10, [Validators.required, Validators.min(1)]],
      category: [''],
      duration_minutes: [30, [Validators.required, Validators.min(1)]],
      title: ['', Validators.required],
      description: [''],
      reward_type: ['xp', Validators.required],
      reward_amount: [0, [Validators.required, Validators.min(0)]],
      bonus_reward_type: ['tickets'],
      bonus_reward_amount: [0, [Validators.min(0)]],
      max_claims: [null],
      start_at: [null],
      end_at: [null],
      active: [true],
    });
  }

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    this.tasksService.listPublic().subscribe({
      next: (tasks) => {
        this.tasks = tasks;
      },
      error: () => {},
    });
  }

  editTask(task: Task): void {
    this.editingTask = task;
    this.form.patchValue({
      task_kind: task.task_kind || 'duration',
      achievement_type: task.achievement_type || 'cards_collected',
      achievement_target: task.criteria?.['target'] || 10,
      category: task.category || '',
      duration_minutes: task.duration_minutes || 30,
      title: task.title,
      description: task.description || '',
      reward_type: task.reward_type || 'xp',
      reward_amount: task.reward_amount || 0,
      bonus_reward_type: task.rewards?.[1]?.type || 'tickets',
      bonus_reward_amount: task.rewards?.[1]?.amount || 0,
      max_claims: task.max_claims || null,
      start_at: task.start_at ? new Date(task.start_at) : null,
      end_at: task.end_at ? new Date(task.end_at) : null,
      active: task.active ?? true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingTask = null;
    this.form.reset({
      task_kind: 'duration',
      achievement_type: 'cards_collected',
      achievement_target: 10,
      category: '',
      duration_minutes: 30,
      reward_type: 'xp',
      reward_amount: 0,
      bonus_reward_type: 'tickets',
      bonus_reward_amount: 0,
      active: true,
    });
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    const payload: any = {
      task_kind: v.task_kind,
      achievement_type: v.task_kind === 'achievement' ? v.achievement_type : null,
      category: v.category || null,
      duration_minutes: (v.task_kind === 'duration' || v.task_kind === 'test') ? Number(v.duration_minutes) : null,
      criteria: v.task_kind === 'achievement' ? { target: Number(v.achievement_target ?? 0), achievement_type: v.achievement_type } : {},
      title: v.title,
      description: v.description,
      reward_type: v.reward_type,
      reward_amount: v.reward_amount,
      rewards: [
        { type: v.reward_type, amount: Number(v.reward_amount ?? 0) },
        ...(Number(v.bonus_reward_amount ?? 0) > 0 ? [{ type: v.bonus_reward_type, amount: Number(v.bonus_reward_amount) }] : []),
      ],
      max_claims: v.max_claims || null,
      start_at: v.start_at ? new Date(v.start_at).toISOString() : undefined,
      end_at: v.end_at ? new Date(v.end_at).toISOString() : undefined,
      active: !!v.active,
    };

    if (this.editingTask) {
      this.tasksService.updateTask(this.editingTask.id, payload).subscribe({
        next: () => {
          this.cancelEdit();
          this.loadTasks();
        },
        error: () => {},
      });
    } else {
      this.tasksService.createTask(payload).subscribe({
        next: () => {
          this.form.reset({
            task_kind: 'duration',
            achievement_type: 'cards_collected',
            achievement_target: 10,
            duration_minutes: 30,
            reward_type: 'xp',
            reward_amount: 0,
            bonus_reward_type: 'tickets',
            bonus_reward_amount: 0,
            active: true,
          });
          this.loadTasks();
        },
        error: () => {},
      });
    }
  }

  deleteTask(): void {
    if (!this.editingTask) return;
    if (!confirm(`Delete task "${this.editingTask.title}"?`)) return;
    
    this.tasksService.deleteTask(this.editingTask.id).subscribe({
      next: () => {
        this.cancelEdit();
        this.loadTasks();
      },
      error: () => {},
    });
  }
}