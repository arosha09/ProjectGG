import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { HttpClient } from '@angular/common/http';
import { Subscription, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

interface CharacterProgress {
  level: number;
  experience: number;
  rank_name: string | null;
  rank_code: string | null;
  card_count: number;
}
interface GameCharacter {
  id: string;
  name: string;
  mugshot_url?: string | null;
  data?: { backpack_class?: string; voice_type?: string };
  progression?: Partial<Record<'solo' | 'online', CharacterProgress>> | null;
  progression_unavailable?: boolean;
  last_synced_at?: string | null;
}

@Component({
  selector: 'app-game-characters',
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './game-characters.component.html',
  styleUrls: ['./game-characters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCharactersComponent implements OnChanges, OnDestroy {
  @Input() userId = '';
  characters: GameCharacter[] = [];
  loading = false;
  error = '';
  mode: 'solo' | 'online' = 'solo';
  readonly failedImages = new Set<string>();
  private request?: Subscription;
  constructor(private readonly http: HttpClient, private readonly cdr: ChangeDetectorRef) {}
  ngOnChanges(): void { this.characters = []; this.refresh(); }
  ngOnDestroy(): void { this.request?.unsubscribe(); }
  @HostListener('window:focus') onFocus(): void { if (!this.loading) this.refresh(); }
  refresh(): void {
    this.request?.unsubscribe();
    if (!this.userId) return;
    const owner = this.userId;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.request = this.http.get<GameCharacter[] | { characters: GameCharacter[] }>(`${environment.apiUrl}/characters`).pipe(timeout(30000)).subscribe({
      next: response => {
        if (owner !== this.userId) return;
        const records = Array.isArray(response) ? response : response?.characters;
        if (!Array.isArray(records)) {
          this.error = 'Characters could not be loaded. Please try again.';
        } else {
          this.characters = records;
          this.failedImages.clear();
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (owner !== this.userId) return;
        this.error = 'Your characters could not be loaded. Your saved characters have not been deleted.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
  setMode(value: 'solo' | 'online'): void {
    this.mode = value === 'online' ? 'online' : 'solo';
  }
  progress(character: GameCharacter): CharacterProgress | null { return character.progression?.[this.mode] ?? null; }
  portraitFailed(id: string): void { this.failedImages.add(id); this.cdr.markForCheck(); }
  initials(name: string): string { return (name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
}
