import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { environment } from '../../environments/environment';
import { JamService } from './jam.service';
import { JamState } from '../models/jam.model';

export interface Track {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
}

export interface PlaylistTrack {
  id: number;
  playlist_id: number;
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  position: number;
}

export interface Playlist {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
  tracks: PlaylistTrack[];
}

export interface YoutubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  trackCount: number;
  channelTitle: string;
}

@Injectable({ providedIn: 'root' })
export class MusicPlayerService implements OnDestroy {
  private readonly apiUrl = environment.apiUrl;
  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  private readonly currentTrack$ = new BehaviorSubject<Track | null>(null);
  private readonly isPlaying$ = new BehaviorSubject<boolean>(false);
  private readonly progress$ = new BehaviorSubject<number>(0);
  private readonly currentTime$ = new BehaviorSubject<number>(0);
  private readonly duration$ = new BehaviorSubject<number>(0);
  private readonly searchResults$ = new BehaviorSubject<Track[]>([]);
  private readonly isSearching$ = new BehaviorSubject<boolean>(false);
  private readonly showResults$ = new BehaviorSubject<boolean>(false);
  private readonly expanded$ = new BehaviorSubject<boolean>(false);
  private readonly queue$ = new BehaviorSubject<Track[]>([]);
  private readonly queueIndex$ = new BehaviorSubject<number>(-1);
  private readonly playlists$ = new BehaviorSubject<Playlist[]>([]);
  private readonly youtubePlaylists$ = new BehaviorSubject<YoutubePlaylist[]>([]);
  private readonly loadingYoutubePlaylists$ = new BehaviorSubject<boolean>(false);
  private readonly shuffle$ = new BehaviorSubject<boolean>(false);
  private readonly repeat$ = new BehaviorSubject<'off' | 'all' | 'one'>('off');
  private readonly volume$ = new BehaviorSubject<number>(0.8);
  private readonly frequencyData$ = new BehaviorSubject<number[]>(new Array(30).fill(0));

  private player: any = null;
  private apiLoaded = false;
  private playerReady = false;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private progressRaf: number | null = null;
  private vizRaf: number | null = null;
  private prevFreqBars: number[] = new Array(30).fill(0);
  private vizFrameCount = 0;
  private applyingJamState = false;

  readonly track$ = this.currentTrack$.asObservable();
  readonly playing$ = this.isPlaying$.asObservable();
  readonly prog$ = this.progress$.asObservable();
  readonly time$ = this.currentTime$.asObservable();
  readonly dur$ = this.duration$.asObservable();
  readonly results$ = this.searchResults$.asObservable();
  readonly searching$ = this.isSearching$.asObservable();
  readonly showRes$ = this.showResults$.asObservable();
  readonly expandedObs$ = this.expanded$.asObservable();
  readonly queueObs$ = this.queue$.asObservable();
  readonly queueIdx$ = this.queueIndex$.asObservable();
  readonly playlistsObs$ = this.playlists$.asObservable();
  readonly youtubePlaylistsObs$ = this.youtubePlaylists$.asObservable();
  readonly loadingYoutubePlaylistsObs$ = this.loadingYoutubePlaylists$.asObservable();
  readonly shuffleObs$ = this.shuffle$.asObservable();
  readonly repeatObs$ = this.repeat$.asObservable();
  readonly volumeObs$ = this.volume$.asObservable();
  readonly freqData$ = this.frequencyData$.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone,
    private readonly jamService: JamService,
  ) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(query => {
      if (query.trim()) this.doSearch(query);
      else {
        this.searchResults$.next([]);
        this.showResults$.next(false);
        this.isSearching$.next(false);
      }
    });

    this.jamService.session$.pipe(takeUntil(this.destroy$)).subscribe((session) => {
      this.applyJamState(session);
    });
  }

  loadPlaylists(): void {
    this.http.get<Playlist[]>(`${this.apiUrl}/music/playlists`).subscribe({
      next: (playlists) => this.playlists$.next(playlists),
      error: () => {},
    });
  }

  loadYoutubePlaylists(): void {
    this.loadingYoutubePlaylists$.next(true);
    this.http.get<YoutubePlaylist[]>(`${this.apiUrl}/platform/youtube/playlists`).subscribe({
      next: (playlists) => {
        this.youtubePlaylists$.next(playlists);
        this.loadingYoutubePlaylists$.next(false);
      },
      error: () => {
        this.youtubePlaylists$.next([]);
        this.loadingYoutubePlaylists$.next(false);
      },
    });
  }

  loadYoutubePlaylistTracks(playlistId: string): void {
    this.loadingYoutubePlaylists$.next(true);
    this.http.get<Track[]>(`${this.apiUrl}/platform/youtube/playlists/${playlistId}/tracks`).subscribe({
      next: (tracks) => {
        this.queue$.next(tracks);
        this.queueIndex$.next(0);
        if (tracks.length > 0) {
          this.playTrack(tracks[0]);
        }
        this.loadingYoutubePlaylists$.next(false);
      },
      error: () => {
        this.loadingYoutubePlaylists$.next(false);
      },
    });
  }

  fetchYoutubePlaylistTracksPreview(playlistId: string): Observable<Track[]> {
    return this.http.get<Track[]>(`${this.apiUrl}/platform/youtube/playlists/${playlistId}/tracks`);
  }

  savePlaylist(name: string): void {
    const tracks = this.queue$.value;
    if (!tracks.length) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    this.http.post<Playlist>(`${this.apiUrl}/music/playlists/save`, {
      name: trimmed,
      tracks: tracks.map(t => ({
        videoId: t.videoId,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
      })),
    }).subscribe({
      next: (playlist) => {
        if (playlist) {
          const current = this.playlists$.value.filter(p => p.name !== trimmed);
          this.playlists$.next([playlist, ...current]);
        }
      },
    });
  }

  loadPlaylist(name: string): void {
    const playlist = this.playlists$.value.find(p => p.name === name);
    if (!playlist || !playlist.tracks.length) return;
    this.queue$.next(playlist.tracks.map(t => ({
      videoId: t.video_id,
      title: t.title,
      artist: t.artist,
      thumbnail: t.thumbnail,
    })));
    this.queueIndex$.next(0);
    this.playTrack({
      videoId: playlist.tracks[0].video_id,
      title: playlist.tracks[0].title,
      artist: playlist.tracks[0].artist,
      thumbnail: playlist.tracks[0].thumbnail,
    });
  }

  addToQueue(track: Track): void {
    const current = this.queue$.value;
    const exists = current.some(t => t.videoId === track.videoId);
    if (!exists) {
      this.queue$.next([...current, track]);
    }
  }

  deletePlaylist(name: string): void {
    const pl = this.playlists$.value.find(p => p.name === name);
    if (!pl) return;
    this.http.delete(`${this.apiUrl}/music/playlists/${pl.id}`).subscribe({
      next: () => {
        this.playlists$.next(this.playlists$.value.filter(p => p.id !== pl.id));
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearProgressInterval();
    this.stopProgressRaf();
    this.stopVizLoop();
    try { this.player?.destroy(); } catch {}
  }

  loadYouTubeAPI(): void {
    if (this.apiLoaded) return;
    if ((window as any).YT?.Player) {
      this.apiLoaded = true;
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => {
      this.ngZone.run(() => { this.apiLoaded = true; });
    };
  }

  search(query: string): void {
    this.searchSubject.next(query);
  }

  hideResults(): void {
    setTimeout(() => this.showResults$.next(false), 200);
  }

  showResultsPanel(): void {
    if (this.searchResults$.value.length > 0) {
      this.showResults$.next(true);
    }
  }

  private doSearch(query: string): void {
    this.isSearching$.next(true);
    this.http.get<Track[]>(`${this.apiUrl}/platform/youtube/search`, {
      params: { q: query },
    }).subscribe({
      next: (results) => {
        this.searchResults$.next(results);
        this.showResults$.next(results.length > 0);
        this.isSearching$.next(false);
      },
      error: () => {
        this.searchResults$.next([]);
        this.isSearching$.next(false);
      },
    });
  }

  playTrack(track: Track): void {
    this.currentTrack$.next(track);
    this.showResults$.next(false);

    // Update queue
    const current = this.queue$.value;
    const idx = current.findIndex(t => t.videoId === track.videoId);
    if (idx >= 0) {
      this.queueIndex$.next(idx);
    } else {
      this.queue$.next([...current, track]);
      this.queueIndex$.next(current.length);
    }

    this.syncTrackToJamIfHost(track);

    if (!this.apiLoaded) return;
    if (this.player) {
      this.player.loadVideoById(track.videoId);
    } else {
      this.createPlayer(track.videoId);
    }
  }

  private createPlayer(videoId: string): void {
    if (!(window as any).YT?.Player) return;
    this.playerReady = false;

    // Ensure container element exists
    let container = document.getElementById('cyber-music-yt-player');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cyber-music-yt-player';
      container.style.cssText = 'position:fixed;width:0;height:0;visibility:hidden;pointer-events:none;z-index:-1';
      document.body.appendChild(container);
    }

    this.player = new (window as any).YT.Player(container, {
      height: '0',
      width: '0',
      videoId,
      playerVars: { autoplay: 1, modestbranding: 1, rel: 0, controls: 0 },
      events: {
        onReady: () => {
          this.ngZone.run(() => {
            this.playerReady = true;
            this.player?.playVideo();
          });
        },
        onStateChange: (event: any) => this.ngZone.run(() => this.onStateChange(event)),
      },
    });
  }

  private onStateChange(event: any): void {
    const YT = (window as any).YT;
    switch (event.data) {
      case YT?.PlayerState?.PLAYING:
        this.isPlaying$.next(true);
        try { this.duration$.next(this.player?.getDuration() ?? 0); } catch {}
        this.startProgressSync();
        this.startVizLoop();
        break;
      case YT?.PlayerState?.PAUSED:
        this.isPlaying$.next(false);
        this.stopProgressRaf();
        this.startVizLoop();
        break;
      case YT?.PlayerState?.ENDED:
      case YT?.PlayerState?.CUED:
        this.isPlaying$.next(false);
        this.clearProgressInterval();
        this.stopProgressRaf();
        this.startVizLoop();
        this.progress$.next(0);
        this.currentTime$.next(0);
        if (this.repeat$.value === 'one') {
          this.player?.seekTo(0, true);
          this.player?.playVideo();
        } else {
          this.next();
        }
        break;
    }
  }

  togglePlay(): void {
    if (!this.player || !this.currentTrack$.value) return;
    const isHost = this.isJamHost();

    if (isHost && !this.applyingJamState) {
      const session = this.jamService.sessionValue;
      const ct = this.currentTime$.value;
      if (session?.isPlaying) {
        this.jamService.pause(ct);
      } else {
        this.jamService.play(ct);
      }
      return;
    }

    if (this.isPlaying$.value) {
      this.isPlaying$.next(false);
      this.player.pauseVideo();
    } else {
      this.isPlaying$.next(true);
      this.player.playVideo();
    }
  }

  seek(ratio: number): void {
    if (!this.player || !this.duration$.value) return;
    const time = ratio * this.duration$.value;
    if (this.isJamHost() && !this.applyingJamState) {
      this.jamService.seek(time);
    }
    this.player.seekTo(time, true);
  }

  next(): void {
    const queue = this.queue$.value;
    if (!queue.length) return;

    if (this.shuffle$.value) {
      const randomIdx = Math.floor(Math.random() * queue.length);
      this.queueIndex$.next(randomIdx);
      this.playTrack(queue[randomIdx]);
      return;
    }

    const idx = this.queueIndex$.value;
    if (idx < queue.length - 1) {
      const nextIdx = idx + 1;
      this.queueIndex$.next(nextIdx);
      this.playTrack(queue[nextIdx]);
    } else if (this.repeat$.value === 'all') {
      this.queueIndex$.next(0);
      this.playTrack(queue[0]);
    }
  }

  previous(): void {
    const queue = this.queue$.value;
    if (!queue.length) return;

    if (this.shuffle$.value) {
      const randomIdx = Math.floor(Math.random() * queue.length);
      this.queueIndex$.next(randomIdx);
      this.playTrack(queue[randomIdx]);
      return;
    }

    const idx = this.queueIndex$.value;
    if (idx > 0) {
      const prevIdx = idx - 1;
      this.queueIndex$.next(prevIdx);
      this.playTrack(queue[prevIdx]);
    } else if (this.player && this.currentTime$.value > 3) {
      this.player.seekTo(0, true);
    }
  }

  skipToIndex(index: number): void {
    const queue = this.queue$.value;
    if (index >= 0 && index < queue.length) {
      this.queueIndex$.next(index);
      this.playTrack(queue[index]);
    }
  }

  removeFromQueue(index: number): void {
    const queue = [...this.queue$.value];
    const currentIdx = this.queueIndex$.value;
    queue.splice(index, 1);
    this.queue$.next(queue);

    if (index < currentIdx) {
      this.queueIndex$.next(currentIdx - 1);
    } else if (index === currentIdx) {
      if (queue.length === 0) {
        this.queueIndex$.next(-1);
        this.currentTrack$.next(null);
        this.isPlaying$.next(false);
        this.clearProgressInterval();
        this.stopProgressRaf();
        try { this.player?.stopVideo(); } catch {}
      } else {
        const newIdx = Math.min(index, queue.length - 1);
        this.queueIndex$.next(newIdx);
        this.playTrack(queue[newIdx]);
      }
    }
  }

  toggleExpanded(): void {
    this.expanded$.next(!this.expanded$.value);
  }

  collapse(): void {
    this.expanded$.next(false);
  }

  toggleShuffle(): void {
    this.shuffle$.next(!this.shuffle$.value);
  }

  cycleRepeat(): void {
    const current = this.repeat$.value;
    const next = current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
    this.repeat$.next(next);
  }

  setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume$.next(clamped);
    if (this.player) {
      try { this.player.setVolume(clamped * 100); } catch {}
    }
  }

  private isJamHost(): boolean {
    const session = this.jamService.sessionValue;
    if (!session) return false;
    const user = JSON.parse(localStorage.getItem('gg_user') || '{}');
    return !!user.id && session.hostUserId === user.id;
  }

  private syncTrackToJamIfHost(track: Track): void {
    if (this.applyingJamState) return;
    const session = this.jamService.sessionValue;
    if (!session) return;
    if (!this.isJamHost()) return;
    this.jamService.set_track({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
    });
  }

  private applyJamState(session: JamState | null): void {
    if (!session || !session.currentTrack) return;
    if (!this.apiLoaded) return;

    this.applyingJamState = true;
    try {
      const localTrack = this.currentTrack$.value;
      const trackChanged = !localTrack || localTrack.videoId !== session.currentTrack.videoId;

      if (trackChanged) {
        this.currentTrack$.next({
          videoId: session.currentTrack.videoId,
          title: session.currentTrack.title,
          artist: session.currentTrack.artist,
          thumbnail: session.currentTrack.thumbnail,
        });
        this.showResults$.next(false);
        try {
          if (this.player) {
            this.player.loadVideoById(session.currentTrack.videoId);
          } else {
            this.createPlayer(session.currentTrack.videoId);
          }
        } catch {}
      }

      if (session.isPlaying && !this.isPlaying$.value) {
        try { this.player?.playVideo(); } catch {}
      } else if (!session.isPlaying && this.isPlaying$.value) {
        try { this.player?.pauseVideo(); } catch {}
      }

      const drift = Math.abs(this.currentTime$.value - session.currentTime);
      if (drift > 2 && this.player && this.duration$.value > 0) {
        try { this.player.seekTo(session.currentTime, true); } catch {}
      }
    } finally {
      this.applyingJamState = false;
    }
  }

  formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  get hasTrack(): boolean {
    return this.currentTrack$.value !== null;
  }

  get currentTrackValue(): Track | null {
    return this.currentTrack$.value;
  }

  get isPlayingValue(): boolean {
    return this.isPlaying$.value;
  }

  get progressValue(): number {
    return this.progress$.value;
  }

  get durationValue(): number {
    return this.duration$.value;
  }

  get currentTimeValue(): number {
    return this.currentTime$.value;
  }

  private startProgressInterval(): void {
    this.clearProgressInterval();
    this.progressInterval = setInterval(() => {
      if (this.player && this.isPlaying$.value) {
        try {
          const ct = this.player.getCurrentTime();
          const dur = this.player.getDuration();
          this.currentTime$.next(ct);
          this.duration$.next(dur);
          this.progress$.next(dur > 0 ? (ct / dur) * 100 : 0);
        } catch {}
      }
    }, 1000);
  }

  private startProgressSync(): void {
    this.stopProgressRaf();
    this.clearProgressInterval();

    // RAF loop for per-frame updates
    const tick = () => {
      if (!this.player || !this.isPlaying$.value) {
        this.progressRaf = null;
        return;
      }

      try {
        const ct = this.player.getCurrentTime();
        const dur = this.player.getDuration();
        
        if (isFinite(ct) && isFinite(dur) && dur > 0) {
          this.currentTime$.next(ct);
          this.duration$.next(dur);
          this.progress$.next((ct / dur) * 100);
        }
      } catch {}

      this.progressRaf = requestAnimationFrame(tick);
    };

    // Start RAF loop - runs in Angular zone for change detection
    this.progressRaf = requestAnimationFrame(tick);

    // Fallback 250ms interval for extra reliability
    this.progressInterval = setInterval(() => {
      if (this.player && this.isPlaying$.value) {
        try {
          const ct = this.player.getCurrentTime();
          const dur = this.player.getDuration();
          
          if (isFinite(ct) && isFinite(dur) && dur > 0) {
            this.currentTime$.next(ct);
            this.duration$.next(dur);
            this.progress$.next((ct / dur) * 100);
          }
        } catch {}
      }
    }, 250);
  }

  private stopProgressRaf(): void {
    if (this.progressRaf !== null) {
      cancelAnimationFrame(this.progressRaf);
      this.progressRaf = null;
    }
  }

  startVizLoop(): void {
    if (this.vizRaf !== null) return;
    const barCount = 30;

    const tick = () => {
      let shouldContinue = true;
      this.vizFrameCount++;

      if (this.vizFrameCount % 3 !== 0) {
        this.vizRaf = requestAnimationFrame(tick);
        return;
      }

      this.ngZone.run(() => {
        if (!this.isPlaying$.value) {
          // Decay to zero
          let allZero = true;
          const decayed = this.prevFreqBars.map(v => {
            const next = v * 0.88;
            if (next > 0.5) allZero = false;
            return next < 0.5 ? 0 : next;
          });
          this.prevFreqBars = decayed;
          this.frequencyData$.next([...decayed]);
          if (allZero) {
            this.vizRaf = null;
            shouldContinue = false;
          }
        } else {
          // Generate simulated spectrum
          const bars = this.prevFreqBars.map((prev, i) => {
            const norm = i / barCount;
            const energy = 1 - norm * 0.6;
            const target = Math.random() * 255 * energy;
            const speed = target > prev ? 0.35 : 0.18;
            const next = prev + (target - prev) * speed;
            return Math.max(0, Math.min(255, next));
          });
          this.prevFreqBars = bars;
          this.frequencyData$.next([...bars]);
        }
      });

      if (shouldContinue) {
        this.vizRaf = requestAnimationFrame(tick);
      }
    };

    this.vizRaf = requestAnimationFrame(tick);
  }

  private stopVizLoop(): void {
    if (this.vizRaf !== null) {
      cancelAnimationFrame(this.vizRaf);
      this.vizRaf = null;
    }
  }

  private clearProgressInterval(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
}
