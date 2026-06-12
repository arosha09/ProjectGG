import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChatService } from './chat.service';
import { AuthService } from './auth.service';
import { VoiceService } from './voice.service';

export type UserStatus = 'online' | 'away' | 'dnd' | 'invisible';

@Injectable({ providedIn: 'root' })
export class UserStatusService {
  private readonly storageKey = 'projectgg:status';
  private readonly explicitStatus$ = new BehaviorSubject<UserStatus>(this.loadSaved());
  private readonly visibleStatus$ = new BehaviorSubject<UserStatus>(this.resolveVisible(this.explicitStatus$.value, false));
  private readonly chatService = inject(ChatService);
  private readonly auth = inject(AuthService);
  private readonly voiceService = inject(VoiceService);
  private readonly ngZone = inject(NgZone);
  private socketInitialized = false;
  private socketListenersAttached = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private statusBeforeHidden: UserStatus | null = null;

  private readonly HEARTBEAT_VISIBLE_MS = 15_000;
  private readonly HEARTBEAT_HIDDEN_MS = 30_000;

  readonly currentStatus$ = this.visibleStatus$.asObservable();
  readonly preferredStatus$ = this.explicitStatus$.asObservable();

  get currentStatus(): UserStatus {
    return this.visibleStatus$.value;
  }

  get preferredStatus(): UserStatus {
    return this.explicitStatus$.value;
  }

  initialize(): void {
    if (this.socketInitialized) return;
    this.socketInitialized = true;

    this.auth.currentUser$.subscribe((user) => {
      if (!user) {
        this.performFullDisconnect();
        return;
      }

      this.syncFromUser(user);

      if (this.socketListenersAttached) return;
      this.socketListenersAttached = true;

      const socket = this.chatService.connect();

      socket.on('connect', () => {
        this.setConnectionState(true);
        this.chatService.emitStatus(this.explicitStatus$.value);
        this.startHeartbeat();
      });

      socket.on('disconnect', () => {
        this.stopHeartbeat();
        this.setConnectionState(false);
      });

      socket.on('user-status', (payload: any) => {
        if (!payload) return;
        const userId = String(payload.userId ?? payload.user_id ?? '');
        const currentUserId = String(this.auth.getCurrentUser()?.id ?? '');
        if (currentUserId && userId && userId !== currentUserId) return;

        const visible = this.normalizeStatus(payload.status ?? payload.visibleStatus ?? payload.sys_status);
        const preferred = this.normalizeStatus(payload.sys_status ?? payload.preferredStatus ?? payload.status);
        if (preferred) this.explicitStatus$.next(preferred);
        if (visible) this.visibleStatus$.next(visible);
        try {
          if (preferred) localStorage.setItem(this.storageKey, preferred);
        } catch {}
      });

      this.attachVisibilityListener();
    });
  }

  setStatus(status: UserStatus): void {
    this.explicitStatus$.next(status);
    this.visibleStatus$.next(this.resolveVisible(status, true));
    try { localStorage.setItem(this.storageKey, status); } catch {}
    this.chatService.emitStatus(status, true);
  }

  setConnectionState(connected: boolean): void {
    this.visibleStatus$.next(this.resolveVisible(this.explicitStatus$.value, connected));
  }

  markDisconnecting(): void {
    this.stopHeartbeat();
    this.detachVisibilityListener();
    this.visibleStatus$.next(this.resolveVisible(this.explicitStatus$.value, false));
  }

  performFullDisconnect(): void {
    this.markDisconnecting();
    try {
      if (this.voiceService.connected) {
        this.voiceService.leaveChannel();
      }
    } catch {}
    try {
      this.chatService.disconnect();
    } catch {}
  }

  syncFromUser(user: any): void {
    const preferred = this.normalizeStatus(user?.sys_status ?? user?.status);
    const visible = this.normalizeStatus(user?.status);
    if (preferred) {
      this.explicitStatus$.next(preferred);
      try { localStorage.setItem(this.storageKey, preferred); } catch {}
    }
    if (visible) {
      this.visibleStatus$.next(visible);
    } else {
      this.visibleStatus$.next(this.resolveVisible(this.explicitStatus$.value, this.chatService.connect().connected));
    }
  }

  private loadSaved(): UserStatus {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved === 'online' || saved === 'away' || saved === 'invisible' || saved === 'dnd') {
        return saved;
      }
    } catch {}
    return 'online';
  }

  private resolveVisible(status: UserStatus, connected: boolean): UserStatus {
    if (connected) return status;
    return status === 'away' ? 'away' : 'invisible';
  }

  private attachVisibilityListener(): void {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.onHidden();
      } else {
        this.onVisible();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private detachVisibilityListener(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private onHidden(): void {
    this.restartHeartbeat(this.HEARTBEAT_HIDDEN_MS);
    // Go invisible when tab is hidden (but stay in voice)
    this.statusBeforeHidden = this.explicitStatus$.value;
    this.visibleStatus$.next('invisible');
    this.chatService.emitStatus('invisible');
  }

  private onVisible(): void {
    const socket = this.chatService.connect();
    if (socket.connected) {
      socket.emit('heartbeat');
    }
    this.restartHeartbeat(this.HEARTBEAT_VISIBLE_MS);
    // Restore status when tab becomes visible again
    if (this.statusBeforeHidden) {
      const restored = this.statusBeforeHidden;
      this.statusBeforeHidden = null;
      this.visibleStatus$.next(restored);
      this.chatService.emitStatus(restored, true);
    }
  }

  private startHeartbeat(): void {
    const interval = document.hidden ? this.HEARTBEAT_HIDDEN_MS : this.HEARTBEAT_VISIBLE_MS;
    this.restartHeartbeat(interval);
  }

  private restartHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.ngZone.runOutsideAngular(() => {
      this.heartbeatTimer = setInterval(() => {
        const socket = this.chatService.connect();
        if (socket.connected) {
          socket.emit('heartbeat');
        }
      }, intervalMs);
    });
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private normalizeStatus(status: any): UserStatus | null {
    if (status === 'online' || status === 'away' || status === 'dnd' || status === 'invisible') return status;
    return null;
  }
}
