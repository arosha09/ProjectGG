import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export type SoundEvent =
  | 'cursor_hover'
  | 'cursor_click'
  | 'notification_msg'
  | 'notification_mention'
  | 'notification_friend_req'
  | 'alert_error'
  | 'alert_disconnect'
  | 'alert_warning'
  | 'voice_join'
  | 'voice_leave'
  | 'voice_mute'
  | 'voice_unmute'
  | 'voice_deafen'
  | 'voice_undeafen'
  | 'nudge';

export interface SoundSet {
  id: string;
  label: string;
  events: Record<SoundEvent, string>;
}

const SOUND_SETS: SoundSet[] = [
  {
    id: 'cyber',
    label: 'Cyberpunk',
    events: {
      cursor_hover: 'cyber/cursor_hover.mp3',
      cursor_click: 'cyber/cursor_click.mp3',
      notification_msg: 'cyber/notification_msg.mp3',
      notification_mention: 'cyber/notification_mention.mp3',
      notification_friend_req: 'cyber/notification_friend_req.mp3',
      alert_error: 'cyber/alert_error.mp3',
      alert_disconnect: 'cyber/alert_disconnect.mp3',
      alert_warning: 'cyber/alert_warning.mp3',
      voice_join: 'cyber/voice_join.mp3',
      voice_leave: 'cyber/voice_leave.mp3',
      voice_mute: 'cyber/voice_mute.mp3',
      voice_unmute: 'cyber/voice_unmute.mp3',
      voice_deafen: 'cyber/voice_deafen.mp3',
      voice_undeafen: 'cyber/voice_undeafen.mp3',
      nudge: 'cyber/nudge.mp3',
    },
  },
];

@Injectable({
  providedIn: 'root',
})
export class SoundService {
  private readonly apiUrl = environment.apiUrl;
  private readonly setKey = 'selectedSoundSet';
  private readonly volumeKey = 'soundVolume';
  private readonly mutedKey = 'soundMuted';
  private readonly eventsKey = 'disabledSoundEvents';
  private readonly nudgesKey = 'allowIncomingNudges';
  private readonly silentKey = 'soundSilent';

  private setId: string = 'cyber';
  private volume: number = 0.7;
  private muted: boolean = false;
  private silentMode: boolean = false;
  private disabledEvents = new Set<SoundEvent>(['cursor_hover']);
  private preSilentDisabledEvents: Set<SoundEvent> | null = null;
  private allowIncomingNudges: boolean = true;
  private audioContext: AudioContext | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  init(): void {
    const savedSet = localStorage.getItem(this.setKey);
    this.setId = savedSet && SOUND_SETS.some((p) => p.id === savedSet) ? savedSet : 'cyber';

    const savedVolume = localStorage.getItem(this.volumeKey);
    this.volume = savedVolume ? parseFloat(savedVolume) : 0.7;

    const savedMuted = localStorage.getItem(this.mutedKey);
    this.muted = savedMuted === 'true';

    const savedSilent = localStorage.getItem(this.silentKey);
    this.silentMode = savedSilent === 'true';

    const savedEvents = localStorage.getItem(this.eventsKey);
    if (savedEvents) {
      try {
        const parsed = JSON.parse(savedEvents) as SoundEvent[];
        this.disabledEvents = new Set(parsed);
      } catch {}
    }

    const savedNudges = localStorage.getItem(this.nudgesKey);
    this.allowIncomingNudges = savedNudges !== 'false';

    this.http.get<any>(`${this.apiUrl}/users/settings`).subscribe({
      next: (settings) => {
        if (settings?.allow_incoming_nudges !== undefined) {
          this.allowIncomingNudges = settings.allow_incoming_nudges;
          localStorage.setItem(this.nudgesKey, String(this.allowIncomingNudges));
        }
        if (settings?.disabled_notification_kinds?.length) {
          this.disabledEvents = new Set(settings.disabled_notification_kinds as SoundEvent[]);
          localStorage.setItem(this.eventsKey, JSON.stringify([...this.disabledEvents]));
        }
        if (settings?.sound_profile) {
          this.setId = settings.sound_profile;
          localStorage.setItem(this.setKey, this.setId);
        }
      },
      error: () => {},
    });
  }

  get soundSets(): SoundSet[] {
    return SOUND_SETS;
  }

  get currentSetId(): string {
    return this.setId;
  }

  get currentSet(): SoundSet {
    return SOUND_SETS.find((p) => p.id === this.setId) ?? SOUND_SETS[0];
  }

  get currentVolume(): number {
    return this.volume;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isSilentMode(): boolean {
    return this.silentMode;
  }

  get isEventEnabled(): (event: SoundEvent) => boolean {
    return (event: SoundEvent) => !this.disabledEvents.has(event);
  }

  get isAllowIncomingNudges(): boolean {
    return this.allowIncomingNudges;
  }

  selectSet(id: string): void {
    if (!SOUND_SETS.some((p) => p.id === id)) return;
    this.setId = id;
    localStorage.setItem(this.setKey, id);
    const user = this.auth.getCurrentUser();
    if (user) {
      this.http.put(`${this.apiUrl}/users/settings`, { sound_profile: id }).subscribe();
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem(this.volumeKey, String(this.volume));
    if (vol > 0 && this.silentMode) {
      this.silentMode = false;
      this.muted = false;
      this.allowIncomingNudges = true;
      this.disabledEvents = this.preSilentDisabledEvents ?? new Set();
      this.preSilentDisabledEvents = null;
      localStorage.setItem(this.silentKey, 'false');
      localStorage.setItem(this.mutedKey, 'false');
      localStorage.setItem(this.nudgesKey, 'true');
      localStorage.setItem(this.eventsKey, JSON.stringify([...this.disabledEvents]));
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    localStorage.setItem(this.mutedKey, String(this.muted));
  }

  activateSilence(): void {
    this.preSilentDisabledEvents = new Set(this.disabledEvents);
    this.silentMode = true;
    this.muted = true;
    this.allowIncomingNudges = false;
    const allEvents = Object.keys(this.currentSet.events) as SoundEvent[];
    this.disabledEvents = new Set(allEvents);
    localStorage.setItem(this.silentKey, 'true');
    localStorage.setItem(this.mutedKey, 'true');
    localStorage.setItem(this.nudgesKey, 'false');
    localStorage.setItem(this.eventsKey, JSON.stringify([...this.disabledEvents]));
  }

  toggleSilentMode(): void {
    if (this.silentMode) {
      this.silentMode = false;
      this.muted = false;
      this.allowIncomingNudges = true;
      this.disabledEvents = this.preSilentDisabledEvents ?? new Set();
      this.preSilentDisabledEvents = null;
      localStorage.setItem(this.silentKey, 'false');
      localStorage.setItem(this.mutedKey, 'false');
      localStorage.setItem(this.nudgesKey, 'true');
      localStorage.setItem(this.eventsKey, JSON.stringify([...this.disabledEvents]));
    } else {
      this.activateSilence();
    }
  }

  applyDndMode(): void {
    this.activateSilence();
  }

  toggleEvent(event: SoundEvent): void {
    const next = new Set(this.disabledEvents);
    if (next.has(event)) {
      next.delete(event);
    } else {
      next.add(event);
    }
    this.disabledEvents = next;
    localStorage.setItem(this.eventsKey, JSON.stringify([...next]));
    this.saveDisabledKinds([...next]);
  }

  setEventEnabled(event: SoundEvent, enabled: boolean): void {
    const next = new Set(this.disabledEvents);
    if (enabled) {
      next.delete(event);
    } else {
      next.add(event);
    }
    this.disabledEvents = next;
    localStorage.setItem(this.eventsKey, JSON.stringify([...next]));
    this.saveDisabledKinds([...next]);
  }

  private saveDisabledKinds(kinds: string[]): void {
    this.http.put(`${this.apiUrl}/users/settings`, { disabled_notification_kinds: kinds }).subscribe();
  }

  setAllowIncomingNudges(allow: boolean): void {
    this.allowIncomingNudges = allow;
    localStorage.setItem(this.nudgesKey, String(allow));
    this.http.put(`${this.apiUrl}/users/settings`, { allow_incoming_nudges: allow }).subscribe();
  }

  play(event: SoundEvent): void {
    if (this.muted) return;
    if (this.disabledEvents.has(event)) return;

    const set = this.currentSet;
    const relativePath = set.events[event];
    if (!relativePath) return;

    this.playFile(`/assets/sounds/${relativePath}`);
  }

  preview(event: SoundEvent): void {
    const set = this.currentSet;
    const relativePath = set.events[event];
    if (!relativePath) return;
    this.playFile(`/assets/sounds/${relativePath}`, true);
  }

  private async playFile(path: string, force: boolean = false): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    const ctx = this.audioContext;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const r = await fetch(path);
      const buf = await r.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(buf);
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = audioBuffer;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.gain.value = force ? 1.0 : this.volume;
      source.start(0);
    } catch {}
  }
}