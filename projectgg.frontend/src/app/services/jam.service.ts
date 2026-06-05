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
    if (this.socket?.connected) return;

    const user = this.auth.getCurrentUser();
    if (!user) return;

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
        this.zone.run(() => this.connectedSubject.next(true));
      });

      this.socket.on('disconnect', () => {
        this.zone.run(() => this.connectedSubject.next(false));
      });

      this.socket.on('jam:state', (state: JamState) => {
        this.zone.run(() => this.sessionSubject.next(state));
      });

      this.socket.on('jam:track-changed', (data: any) => {
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.currentTrack = data.track;
            s.currentTime = data.currentTime;
            s.isPlaying = data.isPlaying;
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:playback-sync', (data: any) => {
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
        this.zone.run(() => {
          const s = this.sessionSubject.value;
          if (s) {
            s.participants = s.participants.filter((p) => p.userId !== data.userId);
            this.sessionSubject.next({ ...s });
          }
        });
      });

      this.socket.on('jam:participant-joined', (data: any) => {
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
    this.socket?.disconnect();
    this.socket = null;
    this.connectedSubject.next(false);
  }

  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  create_session(persistent = false, settings?: Partial<JamSettings>): Observable<{ code: string; session: JamState }> {
    return this.http.post<{ code: string; session: JamState }>(`${this.apiUrl}/jam/create`, { persistent, settings });
  }

  join_session(code: string): Observable<{ session: JamState }> {
    return this.http.post<{ session: JamState }>(`${this.apiUrl}/jam/join/${code}`, {});
  }

  leave_session(): Observable<any> {
    return this.http.post(`${this.apiUrl}/jam/leave`, {});
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

  request_sync(): void {
    this.emit('jam:sync-request');
  }
}
