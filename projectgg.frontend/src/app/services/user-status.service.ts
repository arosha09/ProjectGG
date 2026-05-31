import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChatService } from './chat.service';
import { AuthService } from './auth.service';

export type UserStatus = 'online' | 'away' | 'dnd' | 'invisible';

@Injectable({ providedIn: 'root' })
export class UserStatusService {
  private readonly storageKey = 'projectgg:status';
  private readonly explicitStatus$ = new BehaviorSubject<UserStatus>(this.loadSaved());
  private readonly visibleStatus$ = new BehaviorSubject<UserStatus>(this.resolveVisible(this.explicitStatus$.value, false));
  private readonly chatService = inject(ChatService);
  private readonly auth = inject(AuthService);
  private socketInitialized = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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
      this.syncFromUser(user);
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
    });
  }

  setStatus(status: UserStatus): void {
    this.explicitStatus$.next(status);
    this.visibleStatus$.next(this.resolveVisible(status, true));
    try { localStorage.setItem(this.storageKey, status); } catch {}
    this.chatService.emitStatus(status);
  }

  setConnectionState(connected: boolean): void {
    this.visibleStatus$.next(this.resolveVisible(this.explicitStatus$.value, connected));
  }

  syncFromUser(user: any): void {
    const preferred = this.normalizeStatus(user?.sys_status ?? user?.status);
    const visible = this.normalizeStatus(user?.status);
    if (preferred) {
      this.explicitStatus$.next(preferred);
      try { localStorage.setItem(this.storageKey, preferred); } catch {}
    }
    // Only resolve visible status if we have a clear idea of the connection,
    // otherwise trust the status from the server
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

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    const socket = this.chatService.connect();
    this.heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat');
      }
    }, 15000);
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
