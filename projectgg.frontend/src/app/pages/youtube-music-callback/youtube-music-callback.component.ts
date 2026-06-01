import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GamesService } from '../../services/games.service';

@Component({
  selector: 'app-youtube-music-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `<p>Connecting YouTube Music...</p>`,
})
export class YoutubeMusicCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private games: GamesService,
  ) {}

  ngOnInit(): void {
    const code = this.route.snapshot.queryParams['code'];
    const state = this.route.snapshot.queryParams['state'];
    const error = this.route.snapshot.queryParams['error'];

    if (error) {
      this.router.navigate(['/settings'], {
        queryParams: { platform: 'youtube_music', error },
      });
      return;
    }

    if (!code || !state) {
      this.router.navigate(['/settings'], {
        queryParams: { platform: 'youtube_music', error: 'Missing code or state' },
      });
      return;
    }

    this.games.validatePlatform('youtube-music', { state, code }).subscribe({
      next: () =>
        this.router.navigate(['/settings'], {
          queryParams: { platform: 'youtube_music', connected: 'true' },
        }),
      error: (err) =>
        this.router.navigate(['/settings'], {
          queryParams: { platform: 'youtube_music', error: err.message },
        }),
    });
  }
}
