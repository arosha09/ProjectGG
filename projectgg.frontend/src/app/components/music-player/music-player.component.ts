import { Component, Input, OnInit, OnDestroy, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

interface TrackResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
}

@Component({
  selector: 'app-music-player',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss'],
})
export class MusicPlayerComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() platformConnections: any[] = [];

  searchQuery = '';
  searchResults: TrackResult[] = [];
  selectedTrack: TrackResult | null = null;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  progress = 0;
  searching = false;
  showResults = false;
  playerReady = false;
  apiLoaded = false;

  private player: any = null;
  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = environment.apiUrl;
  private readonly searchSubject = new Subject<string>();
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  readonly platformDefs = [
    { id: 'youtube', name: 'YouTube', slug: 'youtube', comingSoon: false },
    { id: 'spotify', name: 'Spotify', slug: 'spotify', comingSoon: true },
  ];

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(query => {
      if (query.trim()) this.doSearch(query);
    });
  }

  ngAfterViewInit(): void {
    this.loadYouTubeAPI();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearProgressInterval();
    if (this.player) {
      try { this.player.destroy(); } catch { /* ignore */ }
    }
  }

  private loadYouTubeAPI(): void {
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

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  onSearchFocus(): void {
    if (this.searchResults.length > 0) {
      this.showResults = true;
    }
  }

  onSearchBlur(): void {
    setTimeout(() => { this.showResults = false; }, 200);
  }

  private doSearch(query: string): void {
    this.searching = true;
    this.http.get<any[]>(`${this.apiUrl}/platform/youtube/search`, {
      params: { q: query },
    }).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.showResults = results.length > 0;
        this.searching = false;
      },
      error: () => {
        this.searchResults = [];
        this.searching = false;
      },
    });
  }

  selectTrack(track: TrackResult): void {
    this.selectedTrack = track;
    this.showResults = false;
    this.searchQuery = '';

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
    this.player = new (window as any).YT.Player('youtube-player', {
      height: '0',
      width: '0',
      videoId,
      playerVars: {
        autoplay: 1,
        modestbranding: 1,
        rel: 0,
        controls: 0,
      },
      events: {
        onReady: () => {
          this.ngZone.run(() => { this.playerReady = true; });
          if (this.player) this.player.playVideo();
        },
        onStateChange: (event: any) => this.ngZone.run(() => this.onPlayerStateChange(event)),
      },
    });
  }

  private onPlayerStateChange(event: any): void {
    const YT = (window as any).YT;
    switch (event.data) {
      case YT?.PlayerState?.PLAYING:
        this.isPlaying = true;
        try { this.duration = this.player?.getDuration() ?? 0; } catch { /* ignore */ }
        this.startProgressInterval();
        break;
      case YT?.PlayerState?.PAUSED:
        this.isPlaying = false;
        break;
      case YT?.PlayerState?.ENDED:
      case YT?.PlayerState?.CUED:
        this.isPlaying = false;
        this.clearProgressInterval();
        this.progress = 0;
        this.currentTime = 0;
        break;
    }
  }

  togglePlay(): void {
    if (!this.player || !this.selectedTrack) return;
    if (this.isPlaying) {
      this.player.pauseVideo();
    } else {
      this.player.playVideo();
    }
  }

  seek(event: MouseEvent): void {
    if (!this.player || !this.duration) return;
    const bar = (event.currentTarget as HTMLElement);
    const rect = bar.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const time = ratio * this.duration;
    this.player.seekTo(time, true);
  }

  skipTrack(direction: number): void {
    const idx = this.searchResults.findIndex(t => t.videoId === this.selectedTrack?.videoId);
    const next = idx + direction;
    if (next >= 0 && next < this.searchResults.length) {
      this.selectTrack(this.searchResults[next]);
    }
  }

  private startProgressInterval(): void {
    this.clearProgressInterval();
    this.progressInterval = setInterval(() => {
      if (this.player && this.isPlaying) {
        try {
          this.currentTime = this.player.getCurrentTime();
          this.duration = this.player.getDuration();
          this.progress = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
        } catch { /* ignore */ }
      }
    }, 1000);
  }

  private clearProgressInterval(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  connectPlatform(platform: string): void {
    this.router.navigate(['/settings'], { queryParams: { highlight: platform } });
  }
}
