import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TtsState = 'idle' | 'loading' | 'ready' | 'error';

export interface TtsVoiceOption {
  value: string;
  label: string;
}

export interface UserVoicesResponse {
  voices: Array<{ id: string; label: string; gender: string }>;
  defaultVoice: string;
}

export interface UserVoiceResponse {
  selected_voice: string;
  is_default: boolean;
}

@Injectable({ providedIn: 'root' })
export class KokoroTtsService {
  state = signal<TtsState>('idle');
  error = signal<string | null>(null);

  private voicesSubject = new BehaviorSubject<TtsVoiceOption[]>([]);
  readonly voices$: Observable<TtsVoiceOption[]> = this.voicesSubject.asObservable();

  private selectedVoiceSubject = new BehaviorSubject<string>('');
  readonly selectedVoice$: Observable<string> = this.selectedVoiceSubject.asObservable();

  private defaultVoice = '';

  private readonly apiUrl = `${environment.apiUrl}/tts`;
  private objectUrls = new Set<string>();

  constructor(private http: HttpClient) {}

  preload(): void {
    this.loadUserVoices();
    this.state.set('ready');
  }

  private loadUserVoices(): void {
    this.http.get<UserVoicesResponse>(`${this.apiUrl}/voices/user`).subscribe({
      next: (res) => {
        this.defaultVoice = res.defaultVoice;

        const options = res.voices.map(v => ({
          value: v.id,
          label: v.label,
        }));
        this.voicesSubject.next(options);

        this.selectedVoiceSubject.next(res.defaultVoice);
      },
      error: () => {
        this.voicesSubject.next([
          { value: 'en-US-GuyNeural', label: 'Guy - MALE' },
          { value: 'en-US-AriaNeural', label: 'Aria - Female' },
        ]);
        this.selectedVoiceSubject.next('en-US-GuyNeural');
      },
    });
  }

  getDefaultVoice(): string {
    return this.defaultVoice;
  }

  getSelectedVoice(): string {
    return this.selectedVoiceSubject.getValue();
  }

  getSelectedVoiceObservable(): Observable<string> {
    return this.selectedVoice$;
  }

  setSelectedVoice(voiceId: string): void {
    this.selectedVoiceSubject.next(voiceId);
  }

  saveUserVoice(voiceId: string): Observable<{ success: boolean; selected_voice: string }> {
    return new Observable(subscriber => {
      this.http.put<{ success: boolean; selected_voice: string }>(
        `${this.apiUrl}/user-voice`,
        { voice_id: voiceId }
      ).subscribe({
        next: (res) => {
          if (res.success) {
            this.selectedVoiceSubject.next(res.selected_voice);
          }
          subscriber.next(res);
          subscriber.complete();
        },
        error: (err) => {
          subscriber.error(err);
        },
      });
    });
  }

  getUserVoice(): Observable<UserVoiceResponse> {
    return this.http.get<UserVoiceResponse>(`${this.apiUrl}/user-voice`);
  }

  synthesize(text: string, voice: string = 'en-US-GuyNeural'): Promise<string | null> {
    if (!text.trim()) return Promise.resolve(null);

    this.state.set('loading');
    this.error.set(null);

    return new Promise((resolve) => {
      this.http.post(`${this.apiUrl}/speak`, { text, voice }, {
        responseType: 'blob',
      }).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.objectUrls.add(url);
          this.state.set('ready');
          resolve(url);
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? err?.message ?? 'TTS synthesis failed');
          this.state.set('error');
          resolve(null);
        },
      });
    });
  }

  revokeUrl(url: string): void {
    if (this.objectUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }
  }

  dispose(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
    this.state.set('idle');
  }
}
