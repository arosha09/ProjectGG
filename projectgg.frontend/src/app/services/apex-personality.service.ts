import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type PersonalityPreset =
  | 'gaming-buddy'
  | 'tactical-commander'
  | 'cold-machine'
  | 'cheerful-companion'
  | 'sarcastic-ai'
  | 'custom';

export interface PersonalityInfo {
  id: PersonalityPreset;
  label: string;
  description: string;
  emoji: string;
}

export interface AiPersonality {
  preset: PersonalityPreset;
  custom_prompt: string;
}

@Injectable({ providedIn: 'root' })
export class ApexPersonalityService {
  readonly apiUrl = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  getPersonality(): Observable<{ personality: AiPersonality; presets: PersonalityInfo[] }> {
    return this.http.get<{ personality: AiPersonality; presets: PersonalityInfo[] }>(
      `${this.apiUrl}/personality`,
    );
  }

  savePersonality(payload: { preset: PersonalityPreset; custom_prompt: string }): Observable<AiPersonality> {
    return this.http.put<AiPersonality>(`${this.apiUrl}/personality`, payload);
  }
}