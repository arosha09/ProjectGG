import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

interface TaskDef {
  type: string;
  label: string;
  description: string;
  icon: string;
  threshold: number;
  reward: string;
}

@Component({
  selector: 'app-card-tasks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="tasks-panel">
      <h2 class="tasks-title">TASKS</h2>
      <div class="tasks-list">
        @for (task of taskDefs; track task.type) {
          <div class="task-row">
            <div class="task-icon-wrap">
              <mat-icon>{{ task.icon }}</mat-icon>
            </div>
            <div class="task-info">
              <span class="task-label">{{ task.label }}</span>
              <span class="task-desc">{{ task.description }}</span>
              <div class="task-progress-bar">
                <div class="task-progress-fill" [style.width]="getProgress(task.type, task.threshold) + '%'"></div>
              </div>
              <span class="task-progress-text">{{ getProgress(task.type, task.threshold) }}/{{ task.threshold }}</span>
            </div>
            <div class="task-reward">
              <span class="reward-text">{{ task.reward }}</span>
              @if (isComplete(task.type, task.threshold)) {
                <mat-icon class="reward-check">check_circle</mat-icon>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; padding: 16px; }
    .tasks-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; letter-spacing: 1px; }
    .tasks-list { display: flex; flex-direction: column; gap: 8px; }
    .task-row { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 8px; }
    .task-icon-wrap {
      width: 40px; height: 40px; border-radius: 8px;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-primary); flex-shrink: 0;
    }
    .task-icon-wrap mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .task-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .task-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .task-desc { font-size: 11px; color: var(--text-muted); }
    .task-progress-bar { height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden; }
    .task-progress-fill { height: 100%; background: var(--color-primary); border-radius: 2px; transition: width 0.3s; }
    .task-progress-text { font-size: 10px; color: var(--text-muted); }
    .task-reward { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .reward-text { font-size: 12px; font-weight: 700; color: var(--color-primary); white-space: nowrap; }
    .reward-check { color: #00e676; font-size: 20px; width: 20px; height: 20px; }
  `],
})
export class CardTasksComponent {
  @Input() progress: any[] = [];
  @Output() trackTask = new EventEmitter<string>();

  readonly taskDefs: TaskDef[] = [
    { type: 'send_messages', label: 'Chatterbox', description: 'Send 10 messages in chat', icon: 'chat', threshold: 10, reward: '1 Ticket' },
    { type: 'voice_minutes', label: 'Voice Active', description: 'Spend 30 min in voice channels', icon: 'headset_mic', threshold: 30, reward: '1 Ticket' },
    { type: 'reactions', label: 'Reactor', description: 'React to 5 messages', icon: 'mood', threshold: 5, reward: '50 XP' },
  ];

  getProgress(type: string, threshold: number): number {
    const p = this.progress.find((x: any) => x.task_type === type);
    return Math.min(100, ((p?.count || 0) / threshold) * 100);
  }

  isComplete(type: string, threshold: number): boolean {
    const p = this.progress.find((x: any) => x.task_type === type);
    return (p?.count || 0) >= threshold;
  }
}
