import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Subject, takeUntil } from 'rxjs';
import { JamService } from '../../../services/jam.service';
import { MusicPlayerService } from '../../../services/music-player.service';
import { JamState, JamTrack } from '../../../models/jam.model';
import { Track } from '../../../services/music-player.service';

@Component({
  selector: 'app-jam-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!session) {
      <div class="jam-create-section">
        <div class="jam-title-row">
          <mat-icon class="jam-icon" svgIcon="group"></mat-icon>
          <span class="jam-section-title">Jam Session</span>
        </div>
        <p class="jam-desc">Listen together with friends in real-time</p>

        @if (!configuring) {
          <div class="jam-actions">
            <button class="jam-btn jam-btn-primary" (click)="configuring = true" type="button">
              <mat-icon svgIcon="add"></mat-icon>
              Start a Jam
            </button>
            <div class="jam-join-row">
              <input
                class="jam-code-input"
                type="text"
                placeholder="Enter code..."
                [(ngModel)]="joinCode"
                maxlength="8"
                (keyup.enter)="joinJam()"
              />
              <button class="jam-btn jam-btn-secondary" (click)="joinJam()" [disabled]="!joinCode || loading" type="button">
                Join
              </button>
            </div>
          </div>
        } @else {
          <div class="jam-settings-form">
            <div class="jam-settings-title">
              <mat-icon svgIcon="settings"></mat-icon>
              Jam Settings
            </div>
            <mat-slide-toggle [(ngModel)]="newSettings.anyoneCanAddSongs" color="accent">
              Anyone can add songs
            </mat-slide-toggle>
            <mat-slide-toggle [(ngModel)]="newSettings.anyoneCanSkip" color="accent">
              Anyone can skip
            </mat-slide-toggle>
            <mat-slide-toggle [(ngModel)]="newSettings.anyoneCanPlayPause" color="accent">
              Anyone can play/pause
            </mat-slide-toggle>
            <div class="jam-settings-actions">
              <button class="jam-btn jam-btn-secondary" (click)="configuring = false" type="button">
                <mat-icon svgIcon="close"></mat-icon>
                Cancel
              </button>
              <button class="jam-btn jam-btn-primary" (click)="createJam()" [disabled]="loading" type="button">
                @if (loading) {
                  <span class="jam-spinner"></span>
                } @else {
                  <mat-icon svgIcon="add"></mat-icon>
                }
                Create Jam
              </button>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="jam-active-section">
        <div class="jam-header">
          <div class="jam-header-left">
            <mat-icon class="jam-icon-active" svgIcon="group"></mat-icon>
            <span class="jam-active-title">Jam Session</span>
            @if (isHost) {
              <span class="jam-host-badge">HOST</span>
            }
          </div>
          <button class="jam-btn jam-btn-danger jam-btn-sm" (click)="leaveJam()" type="button">
            <mat-icon svgIcon="logout"></mat-icon>
          </button>
        </div>

        <div class="jam-code-display" (click)="copyCode()">
          <span class="jam-code-label">Share code:</span>
          <span class="jam-code-value">{{ session.code }}</span>
          <mat-icon [svgIcon]="copied ? 'check' : 'content_copy'"></mat-icon>
        </div>

        <div class="jam-participants">
          <div class="jam-participants-label">
            <mat-icon svgIcon="people"></mat-icon>
            <span>{{ session.participants.length }} participant{{ session.participants.length !== 1 ? 's' : '' }}</span>
          </div>
          <div class="jam-participants-list">
            @for (p of session.participants; track p.userId) {
              <div class="jam-participant" [class.jam-is-host]="p.isHost">
                <span class="jam-participant-name">{{ p.displayName || 'User' }}</span>
                @if (p.isHost) {
                  <mat-icon class="jam-crown" svgIcon="star"></mat-icon>
                }
              </div>
            }
          </div>
        </div>

        @if (session.queue.length > 0) {
          <div class="jam-queue">
            <div class="jam-queue-header">
              <mat-icon svgIcon="queue_music"></mat-icon>
              <span>Shared Queue</span>
              <span class="jam-queue-count">{{ session.queue.length }}</span>
            </div>
            <div class="jam-queue-list">
              @for (item of session.queue; track item.videoId; let i = $index) {
                <div class="jam-queue-item">
                  @if (item.thumbnail) {
                    <img [src]="item.thumbnail" alt="" class="jam-queue-thumb" loading="lazy" />
                  } @else {
                    <div class="jam-queue-thumb jam-queue-thumb-empty">
                      <mat-icon svgIcon="music_note"></mat-icon>
                    </div>
                  }
                  <div class="jam-queue-info">
                    <span class="jam-queue-name">{{ item.title }}</span>
                    <span class="jam-queue-artist">{{ item.artist }}</span>
                  </div>
                  @if (canControl) {
                    <button class="jam-queue-remove" (click)="removeFromQueue(i)" type="button">
                      <mat-icon svgIcon="close"></mat-icon>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (isHost) {
          <div class="jam-settings">
            <button class="jam-settings-toggle" (click)="showSettings = !showSettings" type="button">
              <mat-icon svgIcon="settings"></mat-icon>
              <span>Host Settings</span>
              <mat-icon [svgIcon]="showSettings ? 'expand_less' : 'expand_more'"></mat-icon>
            </button>
            @if (showSettings) {
              <div class="jam-settings-panel">
                <label class="jam-toggle">
                  <input type="checkbox" [ngModel]="session.settings.anyoneCanAddSongs" (ngModelChange)="updateSetting('anyoneCanAddSongs', $event)" />
                  <span>Anyone can add songs</span>
                </label>
                <label class="jam-toggle">
                  <input type="checkbox" [ngModel]="session.settings.anyoneCanSkip" (ngModelChange)="updateSetting('anyoneCanSkip', $event)" />
                  <span>Anyone can skip</span>
                </label>
                <label class="jam-toggle">
                  <input type="checkbox" [ngModel]="session.settings.anyoneCanPlayPause" (ngModelChange)="updateSetting('anyoneCanPlayPause', $event)" />
                  <span>Anyone can play/pause</span>
                </label>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styleUrl: './jam-panel.component.scss',
})
export class JamPanelComponent implements OnInit, OnDestroy {
  @Input() currentTrack: Track | null = null;
  @Output() addToQueue = new EventEmitter<JamTrack>();

  private jamService = inject(JamService);
  private musicService = inject(MusicPlayerService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  session: JamState | null = null;
  joinCode = '';
  loading = false;
  copied = false;
  showSettings = false;
  configuring = false;
  newSettings = {
    anyoneCanAddSongs: true,
    anyoneCanSkip: true,
    anyoneCanPlayPause: true,
  };

  get isHost(): boolean {
    const user = JSON.parse(localStorage.getItem('gg_user') || '{}');
    return this.session?.hostUserId === user.id;
  }

  get canControl(): boolean {
    if (this.isHost) return true;
    return this.session?.settings.anyoneCanAddSongs ?? true;
  }

  ngOnInit(): void {
    this.jamService.session$.pipe(takeUntil(this.destroy$)).subscribe((s) => {
      this.session = s;
      this.cdr.markForCheck();
    });

    this.jamService.connect_socket();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  createJam(): void {
    this.loading = true;
    this.jamService.create_session(false, this.newSettings).subscribe({
      next: (res) => {
        this.session = res.session;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  joinJam(): void {
    if (!this.joinCode) return;
    this.loading = true;
    this.jamService.join_session(this.joinCode.toUpperCase()).subscribe({
      next: (res) => {
        this.session = res.session;
        this.joinCode = '';
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  leaveJam(): void {
    this.jamService.leave_session().subscribe(() => {
      this.session = null;
      this.jamService.disconnect_socket();
      this.cdr.markForCheck();
    });
  }

  copyCode(): void {
    if (!this.session) return;
    navigator.clipboard.writeText(this.session.code);
    this.copied = true;
    setTimeout(() => (this.copied = false), 2000);
  }

  removeFromQueue(position: number): void {
    this.jamService.remove_from_queue(position);
  }

  updateSetting(key: string, value: boolean): void {
    this.jamService.update_settings({ [key]: value });
  }

  syncCurrentTrack(): void {
    if (this.currentTrack && this.session) {
      const jamTrack: JamTrack = {
        videoId: this.currentTrack.videoId,
        title: this.currentTrack.title,
        artist: this.currentTrack.artist,
        thumbnail: this.currentTrack.thumbnail,
      };
      this.jamService.set_track(jamTrack);
    }
  }
}
