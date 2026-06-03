import { Injectable, OnDestroy, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface RealtimeNotification {
  type: string;
  title: string;
  body: string;
  data: any;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly notifications$ = new Subject<RealtimeNotification>();
  private readonly connected$ = new Subject<boolean>();
  private readonly auth = inject(AuthService);

  get notifications(): Observable<RealtimeNotification> {
    return this.notifications$.asObservable();
  }

  get connectionStatus(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  connect(): void {
    const user = this.auth.getCurrentUser();
    if (!user?.id) return;
    if (this.socket?.connected) return;

    const wsUrl = environment.apiUrl.replace(/\/api\/?$/, '');
    this.socket = io(`${wsUrl}/realtime`, {
      transports: ['polling', 'websocket'],
      query: { userId: user.id },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });

    this.socket.on('connect', () => this.connected$.next(true));
    this.socket.on('disconnect', () => this.connected$.next(false));
    this.socket.on('connect_error', () => this.connected$.next(false));

    this.socket.on('notification', (data: any) => {
      this.notifications$.next({
        type: data?.type ?? 'info',
        title: data?.title ?? '',
        body: data?.body ?? '',
        data: data?.data ?? null,
        timestamp: Date.now(),
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected$.next(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.notifications$.complete();
    this.connected$.complete();
  }
}
