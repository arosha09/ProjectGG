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
  | 'nudge'
  | 'call_ringing_outgoing';

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
      call_ringing_outgoing: 'cyber/call_outgoing.mp3',
    },
  },
];

export interface RingerSet {
  id: string;
  label: string;
  file: string;
}

const RINGER_SETS: RingerSet[] = [
  { id: 'cyber1', label: 'Cyberpunk-2077', file: 'cyber/call_incoming.mp3' },
  { id: 'cyber2', label: 'Cyberpunk-Edgerunners', file: 'cyber/call_incoming_pulse.mp3' },
  { id: 'cyber3', label: 'Cyberpunk-Johnny', file: 'cyber/call_incoming_echo.mp3' },
];

const OUTGOING_TONES: RingerSet[] = [
  { id: 'cyber-out', label: 'Cyberpunk', file: 'cyber/call_outgoing.mp3' },
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
  private readonly muteSoundboardKey = 'muteSoundboard';
  private readonly ringerKey = 'selectedRinger';
  private readonly outgoingKey = 'selectedOutgoing';

  private setId: string = 'cyber';
  private ringerId: string = 'cyber1';
  private outgoingId: string = 'cyber-out';
  private volume: number = 0.7;
  private muted: boolean = false;
  private silentMode: boolean = false;
  private disabledEvents = new Set<SoundEvent>(['cursor_hover']);
  private preSilentDisabledEvents: Set<SoundEvent> | null = null;
  private allowIncomingNudges: boolean = true;
  private muteSoundboard: boolean = false;
  private audioContext: AudioContext | null = null;
  private currentPreviewSource: AudioBufferSourceNode | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  init(): void {
    const savedSet = localStorage.getItem(this.setKey);
    this.setId = savedSet && SOUND_SETS.some((p) => p.id === savedSet) ? savedSet : 'cyber';

    const savedRinger = localStorage.getItem(this.ringerKey);
    this.ringerId = savedRinger && RINGER_SETS.some((r) => r.id === savedRinger) ? savedRinger : 'cyber1';

    const savedOutgoing = localStorage.getItem(this.outgoingKey);
    this.outgoingId = savedOutgoing && OUTGOING_TONES.some((r) => r.id === savedOutgoing) ? savedOutgoing : 'cyber-out';

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

    const savedMuteSoundboard = localStorage.getItem(this.muteSoundboardKey);
    this.muteSoundboard = savedMuteSoundboard === 'true';

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
        if (settings?.ringer_profile && RINGER_SETS.some((r) => r.id === settings.ringer_profile)) {
          this.ringerId = settings.ringer_profile;
          localStorage.setItem(this.ringerKey, this.ringerId);
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

  get ringerSets(): RingerSet[] {
    return RINGER_SETS;
  }

  get currentRingerId(): string {
    return this.ringerId;
  }

  get currentRingerLabel(): string {
    return RINGER_SETS.find((r) => r.id === this.ringerId)?.label ?? 'Cyberpunk';
  }

  selectRinger(id: string): void {
    if (!RINGER_SETS.some((r) => r.id === id)) return;
    this.ringerId = id;
    localStorage.setItem(this.ringerKey, id);
    const user = this.auth.getCurrentUser();
    if (user) {
      this.http.put(`${this.apiUrl}/users/settings`, { ringer_profile: id }).subscribe();
    }
  }

  get outgoingTones(): RingerSet[] {
    return OUTGOING_TONES;
  }

  get currentOutgoingId(): string {
    return this.outgoingId;
  }

  get currentOutgoingLabel(): string {
    return OUTGOING_TONES.find((r) => r.id === this.outgoingId)?.label ?? 'Cyberpunk';
  }

  selectOutgoing(id: string): void {
    if (!OUTGOING_TONES.some((r) => r.id === id)) return;
    this.outgoingId = id;
    localStorage.setItem(this.outgoingKey, id);
  }

  previewOutgoing(): void {
    const tone = OUTGOING_TONES.find((r) => r.id === this.outgoingId);
    if (!tone) return;
    this.playFile(`/assets/sounds/${tone.file}`, true);
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

  get isMuteSoundboard(): boolean {
    return this.muteSoundboard;
  }

  setMuteSoundboard(mute: boolean): void {
    this.muteSoundboard = mute;
    localStorage.setItem(this.muteSoundboardKey, String(mute));
    this.http.put(`${this.apiUrl}/users/settings`, { mute_soundboard: mute }).subscribe();
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

  play(event: SoundEvent | 'hang_up'): void {
    if (this.muted) return;
    if (event !== 'hang_up' && this.disabledEvents.has(event)) return;

    if (event === 'hang_up') {
      this.playFile('/assets/sounds/hang_up.mp3');
      return;
    }

    if (event === 'call_ringing_outgoing') {
      const tone = OUTGOING_TONES.find((r) => r.id === this.outgoingId);
      if (tone) {
        this.playFile(`/assets/sounds/${tone.file}`);
      }
      return;
    }

    const set = this.currentSet;
    const relativePath = set.events[event];
    if (!relativePath) return;

    this.playFile(`/assets/sounds/${relativePath}`);
  }

  playIncomingRinger(): void {
    if (this.muted) return;
    const ringer = RINGER_SETS.find((r) => r.id === this.ringerId);
    if (ringer) {
      this.playFile(`/assets/sounds/${ringer.file}`);
    }
  }

  preview(event: SoundEvent): void {
    const set = this.currentSet;
    const relativePath = set.events[event];
    if (!relativePath) return;
    this.playFile(`/assets/sounds/${relativePath}`, true);
  }

  previewRinger(): void {
    const ringer = RINGER_SETS.find((r) => r.id === this.ringerId);
    if (!ringer) return;
    this.playFile(`/assets/sounds/${ringer.file}`, true);
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
      if (force) {
        this.currentPreviewSource?.stop();
        this.currentPreviewSource = source;
        source.onended = () => {
          if (this.currentPreviewSource === source) this.currentPreviewSource = null;
        };
      }
      source.start(0);
    } catch (err) {
      console.warn('[SoundService] playFile failed:', path, err);
    }
  }

  stopAll(): void {
    if (this.currentPreviewSource) {
      try { this.currentPreviewSource.stop(); } catch {}
      this.currentPreviewSource = null;
    }
  }
}