import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-music-player',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss'],
})
export class MusicPlayerComponent implements OnInit, OnDestroy {
  @Input() platformConnections: any[] = [];

  selectedPlatform: string | null = null;
  currentlyPlaying: any = null;
  loading = false;
  error = '';

  private readonly destroy$ = new Subject<void>();
  private readonly apiUrl = environment.apiUrl;

  readonly platformDefs: { id: string; name: string; slug: string }[] = [
    { id: 'spotify', name: 'Spotify', slug: 'spotify' },
    { id: 'youtube_music', name: 'YouTube Music', slug: 'youtubemusic' },
    { id: 'apple_music', name: 'Apple Music', slug: 'applemusic' },
  ];

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  get availablePlatforms() {
    return this.platformDefs.map(p => ({
      ...p,
      connected: this.platformConnections.some(c => c.platform === p.id),
    }));
  }

  ngOnInit(): void {
    const connected = this.availablePlatforms.filter(p => p.connected);
    if (connected.length > 0) {
      this.selectedPlatform = connected[0].id;
      this.fetchCurrentlyPlaying();
    }

    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.selectedPlatform) {
          this.fetchTrack().subscribe({
            next: (data) => { this.currentlyPlaying = data; },
          });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectPlatform(platformId: string): void {
    this.selectedPlatform = platformId;
    this.fetchCurrentlyPlaying();
  }

  fetchCurrentlyPlaying(): void {
    this.loading = true;
    this.error = '';
    this.fetchTrack().subscribe({
      next: (data) => {
        this.currentlyPlaying = data;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load currently playing';
        this.currentlyPlaying = null;
        this.loading = false;
      },
    });
  }

  private fetchTrack() {
    return this.http.get(`${this.apiUrl}/platform/music/currently-playing`, {
      params: { platform: this.selectedPlatform ?? '' },
    });
  }

  refresh(): void {
    this.fetchCurrentlyPlaying();
  }

  connectPlatform(platform: string): void {
    this.router.navigate(['/settings'], { queryParams: { highlight: platform } });
  }
}
