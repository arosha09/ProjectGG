import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TtsVoice {
  id: string;
  label: string;
  gender: string;
  pitch?: string;
  rate?: string;
}

export interface TtsVoiceOverride {
  pitch?: string;
  rate?: string;
}

export interface TtsSettings {
  provider: 'edge-tts' | 'google-tts' | 'webspeech';
  edge_voice: string;
  google_voice: string;
  google_api_key: string;
  enabled_voices: string[];
  voice_overrides?: Record<string, TtsVoiceOverride>;
  voice_labels?: Record<string, string>;
  voices?: {
    edge: TtsVoice[];
    google: TtsVoice[];
  };
}

@Injectable({ providedIn: 'root' })
export class TtsSettingsService {
  readonly apiUrl = `${environment.apiUrl}/tts`;

  constructor(private http: HttpClient) {}

  getSettings(): Observable<TtsSettings> {
    return this.http.get<TtsSettings>(`${this.apiUrl}/settings`);
  }

  saveSettings(settings: Partial<TtsSettings>): Observable<TtsSettings> {
    return this.http.put<TtsSettings>(`${this.apiUrl}/settings`, settings);
  }

  getActiveVoices(): Observable<TtsVoice[]> {
    return this.http.get<TtsVoice[]>(`${this.apiUrl}/voices`);
  }
}
