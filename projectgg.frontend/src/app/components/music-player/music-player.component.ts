import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { MusicPlayerService, Track, Playlist, YoutubePlaylist } from '../../services/music-player.service';
import { JamService } from '../../services/jam.service';
import { JamPanelComponent } from './jam-panel/jam-panel.component';
import { JamTrack } from '../../models/jam.model';

@Component({
  selector: 'app-music-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, JamPanelComponent],
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss'],
})
export class MusicPlayerComponent implements OnInit, OnDestroy {
  searchQuery = '';
  private readonly destroy$ = new Subject<void>();

  track: Track | null = null;
  isPlaying = false;
  progress = 0;
  currentTime = 0;
  duration = 0;
  searchResults: Track[] = [];
  searching = false;
  showResults = false;
  expanded = false;
  queue: Track[] = [];
  queueIndex = -1;
  shuffle = false;
  repeat: 'off' | 'all' | 'one' = 'off';
  playlists: Playlist[] = [];
  youtubePlaylists: YoutubePlaylist[] = [];
  loadingYoutubePlaylists = false;
  showSaveInput = false;
  savePlaylistName = '';
  playlistsTab: 'saved' | 'youtube' = 'saved';
  expandedPlaylist: string | null = null;
  expandedYoutubePlaylist: string | null = null;
  expandedYoutubeTracks: Track[] = [];
  loadingYoutubePreview = false;
  showJamPanel = false;
  needsInteraction = false;
  volume = 0.8;
  previousVolume = 0.8;
  showVolumeSlider = false;
  showPlaylistPicker = false;
  private volumeDragging = false;
  private onBeforeUnload = (): void => {};

  readonly platformDefs = [
    { id: 'youtube', name: 'YouTube', slug: 'youtube', active: true },
    { id: 'spotify', name: 'Spotify', slug: 'spotify', active: false, comingSoon: true },
    { id: 'apple_music', name: 'Apple Music', slug: 'apple', active: false, comingSoon: true },
  ];

  constructor(
    public readonly music: MusicPlayerService,
    public readonly jamService: JamService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.music.loadYouTubeAPI();

    this.music.track$.pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.track = t;
      this.cdr.markForCheck();
    });
    this.music.playing$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.isPlaying = p;
      this.cdr.markForCheck();
    });
    this.music.prog$.pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.progress = p;
      this.cdr.markForCheck();
    });
    this.music.time$.pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.currentTime = t;
      this.cdr.markForCheck();
    });
    this.music.dur$.pipe(takeUntil(this.destroy$)).subscribe(d => {
      this.duration = d;
      this.cdr.markForCheck();
    });
    this.music.results$.pipe(takeUntil(this.destroy$)).subscribe(r => { this.searchResults = r; this.cdr.markForCheck(); });
    this.music.searching$.pipe(takeUntil(this.destroy$)).subscribe(s => { this.searching = s; this.cdr.markForCheck(); });
    this.music.showRes$.pipe(takeUntil(this.destroy$)).subscribe(s => { this.showResults = s; this.cdr.markForCheck(); });
    this.music.expandedObs$.pipe(takeUntil(this.destroy$)).subscribe(expanded => {
      this.expanded = expanded;
      if (expanded) {
        this.music.loadPlaylists();
        this.music.loadYoutubePlaylists();
      }
      this.cdr.markForCheck();
    });
    this.music.queueObs$.pipe(takeUntil(this.destroy$)).subscribe(q => { this.queue = q; this.cdr.markForCheck(); });
    this.music.queueIdx$.pipe(takeUntil(this.destroy$)).subscribe(i => { this.queueIndex = i; this.cdr.markForCheck(); });
    this.music.shuffleObs$.pipe(takeUntil(this.destroy$)).subscribe(s => { this.shuffle = s; this.cdr.markForCheck(); });
    this.music.repeatObs$.pipe(takeUntil(this.destroy$)).subscribe(r => { this.repeat = r; this.cdr.markForCheck(); });
    this.music.playlistsObs$.pipe(takeUntil(this.destroy$)).subscribe(p => { this.playlists = p; this.cdr.markForCheck(); });
    this.music.youtubePlaylistsObs$.pipe(takeUntil(this.destroy$)).subscribe(p => { this.youtubePlaylists = p; this.cdr.markForCheck(); });
    this.music.loadingYoutubePlaylistsObs$.pipe(takeUntil(this.destroy$)).subscribe(l => { this.loadingYoutubePlaylists = l; this.cdr.markForCheck(); });
    this.music.needsInteractionObs$.pipe(takeUntil(this.destroy$)).subscribe(n => { this.needsInteraction = n; this.cdr.markForCheck(); });
    this.music.volumeObs$.pipe(takeUntil(this.destroy$)).subscribe(v => { this.volume = v; this.cdr.markForCheck(); });

    this.onBeforeUnload = (): void => {
      if (this.jamService.sessionValue) {
        this.jamService.leaveSessionBeacon();
      }
    };
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(): void {
    this.music.search(this.searchQuery);
  }

  onSearchFocus(): void {
    if (this.searchResults.length > 0) {
      this.music.showResultsPanel();
    }
  }

  selectTrack(track: Track): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.music.playTrack(track);
  }

  togglePlay(): void {
    this.music.togglePlay();
  }

  resolveInteraction(): void {
    this.music.resolveInteraction();
  }

  getThumb(url: string | null | undefined, videoId?: string): string | null {
    if (!url) return null;
    if (url.includes('yt3.googleusercontent.com') && videoId) {
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    return url;
  }

  seek(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    this.music.seek(Math.max(0, Math.min(1, ratio)));
  }

  next(): void {
    this.music.next();
  }

  previous(): void {
    this.music.previous();
  }

  skipTo(index: number): void {
    this.music.skipToIndex(index);
  }

  removeFromQueue(index: number, event: Event): void {
    event.stopPropagation();
    this.music.removeFromQueue(index);
  }

  saveAsPlaylist(): void {
    if (!this.queue.length) return;
    this.savePlaylistName = '';
    this.showSaveInput = true;
  }

  confirmSavePlaylist(): void {
    if (this.savePlaylistName.trim()) {
      this.music.savePlaylist(this.savePlaylistName.trim());
    }
    this.showSaveInput = false;
    this.savePlaylistName = '';
  }

  cancelSavePlaylist(): void {
    this.showSaveInput = false;
    this.savePlaylistName = '';
  }

  loadPlaylist(name: string): void {
    this.music.loadPlaylist(name);
  }

  playPlaylistTrack(track: { video_id?: string; videoId?: string; title: string; artist: string; thumbnail?: string | null }): void {
    const videoId = track.video_id ?? track.videoId ?? '';
    this.music.playTrack({ videoId, title: track.title, artist: track.artist, thumbnail: track.thumbnail ?? null });
  }

  deletePlaylist(name: string): void {
    this.music.deletePlaylist(name);
  }

  loadYoutubePlaylist(playlistId: string): void {
    this.music.loadYoutubePlaylistTracks(playlistId);
  }

  switchPlaylistsTab(tab: 'saved' | 'youtube'): void {
    this.playlistsTab = tab;
    this.expandedPlaylist = null;
    this.expandedYoutubePlaylist = null;
    this.expandedYoutubeTracks = [];
  }

  togglePlaylistExpand(name: string): void {
    this.expandedPlaylist = this.expandedPlaylist === name ? null : name;
  }

  toggleYoutubePlaylistExpand(playlistId: string): void {
    if (this.expandedYoutubePlaylist === playlistId) {
      this.expandedYoutubePlaylist = null;
      this.expandedYoutubeTracks = [];
      return;
    }
    this.expandedYoutubePlaylist = playlistId;
    this.loadingYoutubePreview = true;
    this.music.fetchYoutubePlaylistTracksPreview(playlistId).subscribe({
      next: (tracks) => {
        this.expandedYoutubeTracks = tracks;
        this.loadingYoutubePreview = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingYoutubePreview = false;
        this.expandedYoutubeTracks = [];
        this.cdr.markForCheck();
      },
    });
  }

  toggleExpanded(): void {
    this.music.toggleExpanded();
  }

  collapse(): void {
    this.music.collapse();
  }

  connectPlatform(platform: string): void {
    this.router.navigate(['/settings'], { queryParams: { highlight: platform } });
  }

  formatTime(seconds: number): string {
    return this.music.formatTime(seconds);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.expanded) {
      this.collapse();
    }
    if (e.key === ' ' && this.expanded && !(e.target as HTMLElement).closest('input, textarea')) {
      e.preventDefault();
      this.togglePlay();
    }
  }

  addSavedPlaylistTrackToQueue(trk: { video_id?: string; videoId?: string; title: string; artist: string; thumbnail?: string | null }): void {
    const videoId = trk.video_id ?? trk.videoId ?? '';
    this.music.addToQueue({ videoId, title: trk.title, artist: trk.artist, thumbnail: trk.thumbnail ?? null });
  }

  addSearchResultToQueue(track: Track, event: Event): void {
    event.stopPropagation();
    const session = this.jamService.sessionValue;
    if (session) {
      this.addTrackToJamQueue(track);
    } else {
      this.music.addToQueue(track);
    }
  }

  addTrackToJamQueue(track: Track): void {
    const jamTrack: JamTrack = {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
    };
    this.jamService.add_to_queue(jamTrack);
  }

  isJamActive(): boolean {
    return !!this.jamService.sessionValue;
  }

  addTrackToSavedPlaylist(playlist: Playlist): void {
    if (!this.track) return;
    this.music.addTrackToPlaylist(playlist.id, this.track);
    this.showPlaylistPicker = false;
  }

  toggleMute(): void {
    if (this.volume > 0) {
      this.previousVolume = this.volume;
      this.music.setVolume(0);
    } else {
      this.music.setVolume(this.previousVolume || 0.8);
    }
  }

  onVolumeInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.music.setVolume(val);
  }

  onVolumeBarMouseDown(event: MouseEvent): void {
    this.volumeDragging = true;
    this.updateVolumeFromMouse(event);
    const onMove = (e: MouseEvent) => {
      if (this.volumeDragging) this.updateVolumeFromMouse(e);
    };
    const onUp = () => {
      this.volumeDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private updateVolumeFromMouse(event: MouseEvent): void {
    const bar = document.querySelector('.cyber-volume-slider') as HTMLElement;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    this.music.setVolume(ratio);
  }
}
