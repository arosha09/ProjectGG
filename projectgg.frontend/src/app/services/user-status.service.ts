import { Injectable, inject } from '@angular/core';
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
  private socketInitialized = false;
  private socketListenersAttached = false;
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
      if (!user) {
        // User logged out (or session cleared) — tear down everything so
        // we don't reconnect a socket with an empty userId, and so the
        // backend's handleDisconnect marks us as invisible.
        this.performFullDisconnect();
        return;
      }

      this.syncFromUser(user);

      // Only attach socket listeners once. connect() is idempotent so
      // calling it on every user update is fine, but socket.on() is not —
      // it would stack duplicate listeners and leak memory.
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

  /**
   * Called when the user is signing out (or otherwise permanently leaving).
   * Stops the heartbeat timer and sets local visible status to 'invisible'
   * (or 'away' if the user preferred 'away'). The localStorage entry
   * (projectgg:status) is left alone — it holds the PREFERRED status
   * (sys_status), which is what should be restored on next login.
   *
   * The DB write happens server-side: chat.gateway.handleDisconnect calls
   * setDisconnectedPresence, which sets status='invisible' while
   * preserving sys_status.
   */
  markDisconnecting(): void {
    this.stopHeartbeat();
    this.visibleStatus$.next(this.resolveVisible(this.explicitStatus$.value, false));
  }

  /**
   * Full disconnect: stops the heartbeat, leaves the voice channel if
   * connected, and disconnects the chat socket so the backend's
   * handleDisconnect can mark the user as invisible (sys_status
   * preserved). Triggered automatically when currentUser$ emits null
   * (i.e. on logout, token refresh failure, or auth guard redirect).
   */
  performFullDisconnect(): void {
    this.markDisconnecting();
    try {
      // Leave voice channel if connected — safe to call when not in voice
      this.voiceService.leaveChannel();
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
