import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GamesService } from '../../services/games.service';

@Component({
  selector: 'app-apple-music-callback',
  standalone: true,
  imports: [CommonModule],
  template: `<p>Connecting Apple Music...</p>`,
})
export class AppleMusicCallbackComponent implements OnInit {
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
        queryParams: { platform: 'apple_music', error },
      });
      return;
    }

    if (!code || !state) {
      this.router.navigate(['/settings'], {
        queryParams: { platform: 'apple_music', error: 'Missing code or state' },
      });
      return;
    }

    this.games.validatePlatform('apple-music', { state, code }).subscribe({
      next: () =>
        this.router.navigate(['/settings'], {
          queryParams: { platform: 'apple_music', connected: 'true' },
        }),
      error: (err) =>
        this.router.navigate(['/settings'], {
          queryParams: { platform: 'apple_music', error: err.message },
        }),
    });
  }
}
