import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { JamState, JamSettings, JamTrack } from '../models/jam.model';

@Injectable({ providedIn: 'root' })
export class JamService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private zone = inject(NgZone);

  private apiUrl = environment.apiUrl;
  private wsUrl = this.apiUrl.replace(/\/api\/?$/, '');

  private socket: Socket | null = null;

  private sessionSubject = new BehaviorSubject<JamState | null>(null);
  session$ = this.sessionSubject.asObservable();

  private connectedSubject = new BehaviorSubject<boolean>(false);
  connected$ = this.connectedSubject.asObservable();

  get sessionValue(): JamState | null {
    return this.sessionSubject.value;
  }

  get isConnected(): boolean {
    return this.connectedSubject.value;
  }

  connect_socket(): void {
    if (this.socket?.connected) {
      console.log('[Jam] Socket already connected');
      return;
    }

    const user = this.auth.getCurrentUser();
    if (!user) {
      console.log('[Jam] No current user, cannot connect');
      return;
    }

    console.log('[Jam] Connecting socket to', `${this.wsUrl}/jam`, 'userId:', user.id);
    this.zone.runOutsideAngular(() => {
      this.socket = io(`${this.wsUrl}/jam`, {
        transports: ['websocket'],
        query: { userId: user.id },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
        reconnectionAttempts: Infinity,
      });

      this.socket.on('connect', () => {
        console.log('[Jam] Socket connected, id:', this.socket?.id);
        this.zone.run(() => this.connectedSubject.next(true));
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Jam] Socket disconnected:', reason);
        this.zone.run(() => this.connectedSubject.next(false));
      });

      this.socket.on('jam:state', (state: JamState) => {
        console.log('[Jam] Received jam:state, track:', state.currentTrack?.title, 'playing:', state.isPlaying, 'participants:', state.participants.length);
        this.zone.run(() => this.sessionSubject.next(state));
      });

      this.socket.on('jam:track-changed', (data: any) => {
        console.log('[Jam] Received jam:track-changed, track:', data.track?.title, 'playing:', data.isPlaying);
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.currentTrack = data.track;
            s.currentTime = data.currentTime;
            s.isPlaying = data.isPlaying;
            this.sessionSubject.next({ ...s });
          } else {
            console.log('[Jam] No session to update on track-changed');
          }
        });
      });

      this.socket.on('jam:playback-sync', (data: any) => {
        console.log('[Jam] Received jam:playback-sync, playing:', data.isPlaying, 'time:', data.currentTime);
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.isPlaying = data.isPlaying;
            s.currentTime = data.currentTime;
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:queue-updated', (data: any) => {
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.queue = data.queue;
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:participant-left', (data: any) => {
        console.log('[Jam] Participant left:', data.userId);
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.participants = s.participants.filter((p) => p.userId !== data.userId);
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:participant-joined', (data: any) => {
        console.log('[Jam] Participant joined:', data.participant?.displayName);
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.participants.push(data.participant);
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:host-changed', (data: any) => {
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.hostUserId = data.newHostId;
            s.participants = s.participants.map((p) => ({
              ...p,
              isHost: p.userId === data.newHostId,
            }));
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:settings-changed', (data: any) => {
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.settings = data.settings;
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:control-denied', (data: any) => {
        this.zone.run(() => {
          console.warn('Jam control denied:', data.action);
        });
      });
    });
  }

  disconnect_socket(): void {
    console.log('[Jam] Disconnecting socket');
    this.socket?.disconnect();
    this.socket = null;
    this.connectedSubject.next(false);
  }

  emit(event: string, data?: any): void {
    console.log('[Jam] Emitting:', event, data);
    this.socket?.emit(event, data);
  }

  create_session(persistent = false, settings?: Partial<JamSettings>): Observable<{ code: string; session: JamState }> {
    return this.http.post<{ code: string; session: JamState }>(`${this.apiUrl}/jam/create`, { persistent, settings }).pipe(
      tap((res) => {
        this.zone.run(() => this.sessionSubject.next(res.session));
      }),
    );
  }

  join_session(code: string): Observable<{ session: JamState }> {
    return this.http.post<{ session: JamState }>(`${this.apiUrl}/jam/join/${code}`, {}).pipe(
      tap((res) => {
        this.zone.run(() => this.sessionSubject.next(res.session));
      }),
    );
  }

  leave_session(): Observable<any> {
    return this.http.post(`${this.apiUrl}/jam/leave`, {});
  }

  leaveSessionBeacon(): void {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${this.apiUrl}/jam/leave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      keepalive: true,
    }).catch(() => {});
    this.sessionSubject.next(null);
    this.disconnect_socket();
  }

  get_current(): Observable<{ session: JamState | null }> {
    return this.http.get<{ session: JamState | null }>(`${this.apiUrl}/jam/current`).pipe(
      tap((res) => {
        this.zone.run(() => this.sessionSubject.next(res.session));
      }),
    );
  }

  update_settings(settings: Partial<JamSettings>): Observable<{ settings: JamSettings }> {
    return this.http.patch<{ settings: JamSettings }>(`${this.apiUrl}/jam/settings`, settings);
  }

  play(currentTime?: number): void {
    this.emit('jam:play', { currentTime });
  }

  pause(currentTime?: number): void {
    this.emit('jam:pause', { currentTime });
  }

  seek(time: number): void {
    this.emit('jam:seek', { time });
  }

  skip_next(): void {
    this.emit('jam:skip-next');
  }

  skip_prev(): void {
    this.emit('jam:skip-prev');
  }

  set_track(track: JamTrack | null): void {
    this.emit('jam:track-changed', { track });
  }

  add_to_queue(track: JamTrack): void {
    this.emit('jam:add-to-queue', { track });
  }

  remove_from_queue(position: number): void {
    this.emit('jam:remove-from-queue', { position });
  }

  play_from_queue(position: number): void {
    this.emit('jam:play-from-queue', { position });
  }

  request_sync(): void {
    this.emit('jam:sync-request');
  }

  joinRoom(): void {
    if (this.socket?.connected) {
      this.emit('jam:join-room');
    } else {
      this.connect_socket();
    }
  }
}
