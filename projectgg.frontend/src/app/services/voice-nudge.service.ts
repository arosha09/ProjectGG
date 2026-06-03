import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { SoundService } from './sound.service';
import { StatusNotificationService } from './notification.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class VoiceNudgeService {
  private readonly apiUrl = environment.apiUrl;
  private nudgeTimestamps: number[] = [];
  private readonly maxNudges = 3;
  private readonly windowMs = 5000;
  private nudgedUserIds = new Set<string>();

  onNudgeReceived: ((fromUserId: string, fromUsername: string) => void) | null = null;
  onNudgeSent: ((toUserId: string) => void) | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private sound: SoundService,
    private notifications: StatusNotificationService,
  ) {}

  canNudge(): boolean {
    const now = Date.now();
    this.nudgeTimestamps = this.nudgeTimestamps.filter((t) => t > now - this.windowMs);
    return this.nudgeTimestamps.length < this.maxNudges;
  }

  getNudgeCooldownRemaining(): number {
    if (this.nudgeTimestamps.length === 0) return 0;
    const oldest = Math.min(...this.nudgeTimestamps);
    const remaining = this.windowMs - (Date.now() - oldest);
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  sendNudge(recipientUserId: string, recipientUsername: string): void {
    if (!this.canNudge()) {
      this.notifications.show('Nudge limit reached. Wait a few seconds.', 'error');
      return;
    }

    const user = this.auth.getCurrentUser();
    if (!user) return;

    this.nudgeTimestamps.push(Date.now());

    this.http.post(`${this.apiUrl}/voice/nudge`, { recipientUserId }).subscribe({
      next: () => {
        this.onNudgeSent?.(recipientUserId);
      },
      error: (err) => {
        this.nudgeTimestamps.pop();
        this.notifications.show(err.error?.message || 'Failed to send nudge', 'error');
      },
    });
  }

  handleIncomingNudge(fromUserId: string, fromUsername: string): void {
    if (!this.sound.isAllowIncomingNudges) return;
    if (this.sound.isEventEnabled('nudge') === false) return;

    this.sound.play('nudge');
    this.triggerNudgeVisual(fromUserId);
    this.onNudgeReceived?.(fromUserId, fromUsername);
  }

  triggerNudgeVisual(userId: string): void {
    this.nudgedUserIds = new Set([...this.nudgedUserIds, userId]);
    setTimeout(() => {
      const next = new Set(this.nudgedUserIds);
      next.delete(userId);
      this.nudgedUserIds = next;
    }, 1500);
  }

  isRecentlyNudged(userId: string): boolean {
    return this.nudgedUserIds.has(userId);
  }

  readonly nudgedUserIdsSignal = () => this.nudgedUserIds;
}