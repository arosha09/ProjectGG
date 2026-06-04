import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  Room, RoomEvent, Track, Participant, RemoteTrackPublication,
  TrackPublication, ConnectionState, ConnectionQuality,
} from 'livekit-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { StatusNotificationService } from './notification.service';
import { SoundService } from './sound.service';

export interface VoiceQualityStats {
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  roundTripTime: number;
  packetsLost: number;
  bitrate: number;
  jitter: number;
}

const VOLUME_STORAGE_KEY = 'gg_voice_user_volumes';
const MAX_VOLUME = 2.0;

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private socket: Socket | null = null;
  private room: Room | null = null;
  private isConnected = false;
  private currentChannel: { guildId: string; channelId: string } | null = null;
  private _deafened = false;

  // Audio graph nodes
  private audioContext: AudioContext | null = null;
  private micGainNode: GainNode | null = null;
  private outputGainNode: GainNode | null = null;
  private highpassNode: BiquadFilterNode | null = null;
  private lowpassNode: BiquadFilterNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private micStream: MediaStream | null = null;

  // AudioWorklet VAD
  private vadNode: AudioWorkletNode | null = null;
  private vadReady = false;
  private speakingState = false;

  // Remote audio sources (for cleanup)
  private remoteSources = new Map<string, MediaElementAudioSourceNode>();

  // Per-user volume control
  private remoteGainNodes = new Map<string, GainNode>();
  private userVolumes = new Map<string, number>(); // userId -> volume (0-2)

  // Per-user theme colors (for speaking glow)
  private userThemeColors = new Map<string, string>();

  // Reconnection state
  private livekitReconnecting = false;
  private livekitReconnectAttempts = 0;
  private static readonly LIVEKIT_MAX_RECONNECT = 5;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReconnectChannel: { guildId: string; channelId: string } | null = null;

  // Network quality
  private lastQualityStats: VoiceQualityStats | null = null;

  // Callbacks
  onMemberJoined: ((userId: string, channelId: string, muted: boolean, deafened: boolean) => void) | null = null;
  onMemberLeft: ((userId: string, channelId: string) => void) | null = null;
  onExistingMembers: ((members: { userId: string; muted: boolean; deafened: boolean }[]) => void) | null = null;
  onAudioFrame: ((userId: string, audio: any) => void) | null = null;
  onUserMuted: ((userId: string) => void) | null = null;
  onUserUnmuted: ((userId: string) => void) | null = null;
  onUserDeafened: ((userId: string) => void) | null = null;
  onUserUndeafened: ((userId: string) => void) | null = null;
  onUserSpeaking: ((userId: string) => void) | null = null;
  onUserStoppedSpeaking: ((userId: string) => void) | null = null;
  onAllVoiceState: ((channels: { channelId: string; users: { userId: string; muted: boolean; deafened: boolean; speaking: boolean }[] }[]) => void) | null = null;
  onLocalSpeaking: ((speaking: boolean) => void) | null = null;
  onMicPermissionError: ((error: string) => void) | null = null;
  onVoiceNudge: ((fromUserId: string, fromUsername: string) => void) | null = null;
  onDisconnected: (() => void) | null = null;
  onQualityUpdate: ((stats: VoiceQualityStats) => void) | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly notification: StatusNotificationService,
    private readonly sound: SoundService,
  ) {
    this.loadUserVolumes();
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get currentChannelId(): string | null {
    return this.currentChannel?.channelId ?? null;
  }

  get qualityStats(): VoiceQualityStats | null {
    return this.lastQualityStats;
  }

  async joinChannel(guildId: string, channelId: string): Promise<void> {
    await this.leaveChannel();

    const wsUrl = environment.apiUrl.replace(/\/api\/?$/, '');
    this.socket = io(`${wsUrl}/voice`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);

      this.socket!.on('connect', async () => {
        try {
          const transport = (this.socket as any)?.io?.engine?.transport?.name ?? 'unknown';
          console.log('[Voice] Socket connected via', transport);
          this.setupSocketListeners();

          this.socket!.emit('join-channel', {
            guildId,
            channelId,
            userId: this.auth.getCurrentUser()?.id,
            themeColor: this.getCurrentUserThemeColor(),
          });

          await this.connectToLiveKit(guildId, channelId);

          this.isConnected = true;
          this.currentChannel = { guildId, channelId };
          this.sound.play('voice_join');
          clearTimeout(timeout);
          resolve();
        } catch (e) {
          clearTimeout(timeout);
          this.socket?.emit('leave-channel');
          this.room?.disconnect().catch(() => {});
          this.room = null;
          reject(e);
        }
      });

      this.socket!.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.socket!.on('disconnect', () => {
        if (this.isConnected) {
          this.isConnected = false;
          this._deafened = false;
          const s = this.socket;
          this.socket = null;
          s?.disconnect();
          s?.close();
          this.onDisconnected?.();
        }
      });
    });
  }

  private async connectToLiveKit(guildId: string, channelId: string): Promise<void> {
    const apiBase = environment.apiUrl;
    const resp = await fetch(`${apiBase}/voice/livekit-token?channelId=${encodeURIComponent(channelId)}&guildId=${encodeURIComponent(guildId)}`, {
      headers: { 'Authorization': `Bearer ${this.auth.getToken()}` },
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get LiveKit token');
    }

    const { token, wsUrl } = await resp.json();

    // ── Room Configuration (Discord-level quality) ──────────────────────
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: {
        audioPreset: { maxBitrate: 80_000, priority: 'high' },
        dtx: true,
        red: true,
      },
    });

    this.bindRoomEvents();

    await this.room.connect(wsUrl, token);
    console.log('[Voice] LiveKit room connected');

    // ── Microphone (high-quality capture) ───────────────────────────────
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,            // Mono for voice
        sampleRate: 48000,          // 48 kHz — Opus native rate
        sampleSize: 16,             // 16-bit
        latency: { ideal: 0.005 },  // 5ms target latency
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
      } as any,
    });

    // ── AudioContext (48 kHz for Opus native rate) ─────────────────────
    this.audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive',   // Lowest possible latency
    });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const micSource = this.audioContext.createMediaStreamSource(this.micStream);

    // ── Mic gain node (for mute/unmute) ────────────────────────────────
    this.micGainNode = this.audioContext.createGain();
    this.micGainNode.gain.value = 1;
    micSource.connect(this.micGainNode);

    // ── AudioWorklet VAD (replaces requestAnimationFrame) ──────────────
    await this.setupVAD(micSource);

    // ── Publish processed mic to LiveKit ────────────────────────────────
    const micDestination = this.audioContext.createMediaStreamDestination();
    this.micGainNode.connect(micDestination);
    const processedTrack = micDestination.stream.getAudioTracks()[0];

    await this.room.localParticipant.publishTrack(processedTrack, {
      source: Track.Source.Microphone,
    });

    // ── Output processing chain (Discord-like mastering) ────────────────
    // Highpass: remove rumble below 80 Hz
    this.highpassNode = this.audioContext.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.setValueAtTime(80, this.audioContext.currentTime);
    this.highpassNode.Q.setValueAtTime(0.707, this.audioContext.currentTime);

    // Lowpass: smooth harsh highs above 8 kHz (warm voice sound)
    this.lowpassNode = this.audioContext.createBiquadFilter();
    this.lowpassNode.type = 'lowpass';
    this.lowpassNode.frequency.setValueAtTime(8000, this.audioContext.currentTime);
    this.lowpassNode.Q.setValueAtTime(0.707, this.audioContext.currentTime);

    // Limiter: gentle brickwall to prevent clipping
    this.limiterNode = this.audioContext.createDynamicsCompressor();
    this.limiterNode.threshold.setValueAtTime(-3, this.audioContext.currentTime);
    this.limiterNode.knee.setValueAtTime(3, this.audioContext.currentTime);
    this.limiterNode.ratio.setValueAtTime(12, this.audioContext.currentTime);
    this.limiterNode.attack.setValueAtTime(0.001, this.audioContext.currentTime);
    this.limiterNode.release.setValueAtTime(0.05, this.audioContext.currentTime);

    // Output gain (for deafen)
    this.outputGainNode = this.audioContext.createGain();
    this.outputGainNode.gain.value = 1;

    // Connect: source → highpass → lowpass → limiter → outputGain → destination
    this.highpassNode.connect(this.lowpassNode);
    this.lowpassNode.connect(this.limiterNode);
    this.limiterNode.connect(this.outputGainNode);
    this.outputGainNode.connect(this.audioContext.destination);

    // ── Network quality monitoring ──────────────────────────────────────
    this.startQualityMonitoring();

    // ── Token refresh schedule ──────────────────────────────────────────
    this.scheduleTokenRefresh();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  AudioWorklet VAD Setup
  // ════════════════════════════════════════════════════════════════════════
  private async setupVAD(micSource: MediaStreamAudioSourceNode): Promise<void> {
    if (!this.audioContext) return;

    try {
      await this.audioContext.audioWorklet.addModule('assets/voice/vad-processor.js');
      this.vadNode = new AudioWorkletNode(this.audioContext, 'vad-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0, // We only listen, we don't process audio through it
      });

      this.vadNode.port.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data.type === 'speaking') {
          if (data.value !== this.speakingState) {
            this.speakingState = data.value;
            this.onLocalSpeaking?.(data.value);
          }
        }
        // 'level' messages available for UI level meters if needed
      };

      // Connect mic source to VAD node
      micSource.connect(this.vadNode);
      this.vadReady = true;
      console.log('[Voice] AudioWorklet VAD initialized');
    } catch (err) {
      console.warn('[Voice] AudioWorklet VAD failed, falling back to analyser:', err);
      // Fallback to analyser-based detection
      this.setupFallbackVAD(micSource);
    }
  }

  private setupFallbackVAD(micSource: MediaStreamAudioSourceNode): void {
    if (!this.audioContext) return;

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    micSource.connect(analyser);

    const detect = () => {
      if (!this.isConnected) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
      }
      const rms = Math.sqrt(sum / data.length);

      const speaking = this.speakingState ? rms > 6 : rms > 10;
      if (speaking !== this.speakingState) {
        this.speakingState = speaking;
        this.onLocalSpeaking?.(speaking);
      }

      requestAnimationFrame(detect);
    };
    requestAnimationFrame(detect);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Network Quality Monitoring
  // ════════════════════════════════════════════════════════════════════════
  private startQualityMonitoring(): void {
    if (!this.room) return;

    // Listen for connection quality changes on all participants
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant?: Participant) => {
      if (participant && participant === this.room?.localParticipant) {
        const stats: VoiceQualityStats = {
          connectionQuality: this.mapQuality(quality),
          roundTripTime: 0,
          packetsLost: 0,
          bitrate: 0,
          jitter: 0,
        };
        this.lastQualityStats = stats;
        this.onQualityUpdate?.(stats);
      }
    });
  }

  private mapQuality(q: ConnectionQuality): 'excellent' | 'good' | 'poor' | 'unknown' {
    switch (q) {
      case ConnectionQuality.Excellent: return 'excellent';
      case ConnectionQuality.Good: return 'good';
      case ConnectionQuality.Poor: return 'poor';
      default: return 'unknown';
    }
  }

  private stopQualityMonitoring(): void {
    this.lastQualityStats = null;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  LiveKit Reconnection
  // ════════════════════════════════════════════════════════════════════════
  private async attemptLiveKitReconnect(): Promise<void> {
    if (!this.currentChannel || this.livekitReconnecting) return;

    this.livekitReconnecting = true;
    this.livekitReconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, this.livekitReconnectAttempts - 1), 10000);
    console.log(`[Voice] LiveKit reconnect attempt ${this.livekitReconnectAttempts}/${VoiceService.LIVEKIT_MAX_RECONNECT} in ${delay}ms`);

    await new Promise(r => setTimeout(r, delay));

    if (!this.isConnected || !this.currentChannel) {
      this.livekitReconnecting = false;
      return;
    }

    try {
      // Disconnect old room
      if (this.room) {
        this.room.disconnect().catch(() => {});
        this.room = null;
      }

      // Clean up old remote sources
      this.remoteSources.forEach(s => s.disconnect());
      this.remoteSources.clear();
      this.remoteGainNodes.forEach(g => g.disconnect());
      this.remoteGainNodes.clear();

      // Reconnect
      await this.connectToLiveKit(this.currentChannel.guildId, this.currentChannel.channelId);

      this.livekitReconnecting = false;
      this.livekitReconnectAttempts = 0;
      console.log('[Voice] LiveKit reconnected successfully');
    } catch (err) {
      console.warn('[Voice] LiveKit reconnect failed:', err);
      this.livekitReconnecting = false;

      if (this.livekitReconnectAttempts >= VoiceService.LIVEKIT_MAX_RECONNECT) {
        console.error('[Voice] Max reconnect attempts reached, leaving channel');
        this.leaveChannel();
      } else {
        this.attemptLiveKitReconnect();
      }
    }
  }

  private scheduleTokenRefresh(): void {
    this.clearTokenRefresh();
    // Refresh token at 3.5 hours (token TTL is 4h)
    const refreshMs = 3.5 * 60 * 60 * 1000;
    this.tokenRefreshTimer = setTimeout(() => {
      if (this.isConnected && this.currentChannel) {
        console.log('[Voice] Refreshing LiveKit token');
        this.connectToLiveKit(this.currentChannel.guildId, this.currentChannel.channelId).catch(() => {
          console.warn('[Voice] Token refresh failed');
        });
      }
    }, refreshMs);
  }

  private clearTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Room Events
  // ════════════════════════════════════════════════════════════════════════
  private bindRoomEvents(): void {
    if (!this.room) return;

    this.room
      .on(RoomEvent.Connected, () => {
        console.log('[Voice] LiveKit connected');
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('[Voice] LiveKit disconnected');
        if (this.isConnected && this.currentChannel && !this.livekitReconnecting) {
          this.attemptLiveKitReconnect();
        } else if (this.isConnected) {
          this.leaveChannel();
        }
      })
      .on(RoomEvent.TrackSubscribed, (track: Track, _pub: RemoteTrackPublication, participant: Participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = 'none';
          document.body.appendChild(el);

          if (this.audioContext && this.highpassNode) {
            try {
              const source = this.audioContext.createMediaElementSource(el);

              // Per-user gain node for volume control
              const userGain = this.audioContext.createGain();
              const savedVol = this.userVolumes.get(participant.identity) ?? 1;
              userGain.gain.value = savedVol;

              // Chain: source → userGain → highpass → ...
              source.connect(userGain);
              userGain.connect(this.highpassNode);

              if (track.sid) {
                this.remoteSources.set(track.sid, source);
              }
              this.remoteGainNodes.set(participant.identity, userGain);
            } catch (err) {
              console.warn('[Voice] Failed to create MediaElementSource:', err);
            }
          }
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        if (track.sid) {
          const source = this.remoteSources.get(track.sid);
          if (source) {
            source.disconnect();
            this.remoteSources.delete(track.sid);
          }
        }
        track.detach().forEach(el => el.remove());
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: Participant) => {
        console.log('[Voice] Participant left:', participant.identity);
        const gain = this.remoteGainNodes.get(participant.identity);
        if (gain) {
          gain.disconnect();
          this.remoteGainNodes.delete(participant.identity);
        }
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (!this.room) return;
        const speakerIds = new Set(speakers.map(s => s.identity));

        this.room.remoteParticipants.forEach((p) => {
          if (speakerIds.has(p.identity)) {
            this.onUserSpeaking?.(p.identity);
          } else {
            this.onUserStoppedSpeaking?.(p.identity);
          }
        });
      })
      .on(RoomEvent.ParticipantConnected, (participant: Participant) => {
        console.log('[Voice] Participant joined:', participant.identity);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: Participant) => {
        console.log('[Voice] Participant left:', participant.identity);
      })
      .on(RoomEvent.MediaDevicesError, (error: Error) => {
        console.error('[Voice] Media device error:', error);
        this.onMicPermissionError?.(`Microphone error: ${error.message}`);
      });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Socket Listeners
  // ════════════════════════════════════════════════════════════════════════
  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('member-joined', (data: { userId: string; channelId: string; muted: boolean; deafened: boolean; themeColor?: string }) => {
      if (data.themeColor) this.userThemeColors.set(data.userId, data.themeColor);
      this.onMemberJoined?.(data.userId, data.channelId, data.muted, data.deafened);
    });

    this.socket.on('member-left', (data: { userId: string; channelId: string }) => {
      this.userThemeColors.delete(data.userId);
      this.onMemberLeft?.(data.userId, data.channelId);
    });

    this.socket.on('existing-members', (data: { members: { userId: string; muted: boolean; deafened: boolean; themeColor?: string }[] }) => {
      for (const m of data.members) {
        if (m.themeColor) this.userThemeColors.set(m.userId, m.themeColor);
      }
      this.onExistingMembers?.(data.members);
    });

    this.socket.on('play-sound', (data: { sound: string; userId: string }) => {
      if (data.sound === 'voice_join' || data.sound === 'voice_leave') {
        this.sound.play(data.sound);
      }
    });

    this.socket.on('audio-frame', () => {});

    this.socket.on('user-muted', (data: { userId: string }) => {
      this.onUserMuted?.(data.userId);
    });

    this.socket.on('user-unmuted', (data: { userId: string }) => {
      this.onUserUnmuted?.(data.userId);
    });

    this.socket.on('user-deafened', (data: { userId: string }) => {
      this.onUserDeafened?.(data.userId);
    });

    this.socket.on('user-undeafened', (data: { userId: string }) => {
      this.onUserUndeafened?.(data.userId);
    });

    this.socket.on('user-speaking', (data: { userId: string }) => {
      this.onUserSpeaking?.(data.userId);
    });

    this.socket.on('user-stopped-speaking', (data: { userId: string }) => {
      this.onUserStoppedSpeaking?.(data.userId);
    });

    this.socket.on('all-voice-state', (data: { channels: { channelId: string; users: { userId: string; muted: boolean; deafened: boolean; speaking: boolean; themeColor?: string }[] }[] }) => {
      for (const ch of data.channels) {
        for (const u of ch.users) {
          if (u.themeColor) this.userThemeColors.set(u.userId, u.themeColor);
        }
      }
      this.onAllVoiceState?.(data.channels);
    });

    this.socket.on('voice-nudge', (data: { fromUserId: string; fromUsername: string }) => {
      this.onVoiceNudge?.(data.fromUserId, data.fromUsername);
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Leave / Cleanup
  // ════════════════════════════════════════════════════════════════════════
  async leaveChannel(): Promise<void> {
    this.isConnected = false;
    this.stopQualityMonitoring();
    this.clearTokenRefresh();
    this.livekitReconnecting = false;
    this.livekitReconnectAttempts = 0;

    if (this.vadNode) {
      this.vadNode.disconnect();
      this.vadNode = null;
      this.vadReady = false;
    }

    if (this.room) {
      this.room.disconnect().catch(() => {});
      this.room = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }

    // Disconnect all audio nodes
    if (this.micGainNode) {
      this.micGainNode.disconnect();
      this.micGainNode = null;
    }
    if (this.outputGainNode) {
      this.outputGainNode.disconnect();
      this.outputGainNode = null;
    }
    if (this.highpassNode) {
      this.highpassNode.disconnect();
      this.highpassNode = null;
    }
    if (this.lowpassNode) {
      this.lowpassNode.disconnect();
      this.lowpassNode = null;
    }
    if (this.limiterNode) {
      this.limiterNode.disconnect();
      this.limiterNode = null;
    }

    // Clean up remote sources
    this.remoteSources.forEach(s => s.disconnect());
    this.remoteSources.clear();

    // Clean up per-user gain nodes
    this.remoteGainNodes.forEach(g => g.disconnect());
    this.remoteGainNodes.clear();

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.speakingState = false;

    if (this.socket) {
      this.socket.emit('leave-channel');
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentChannel = null;
    this._deafened = false;
    this.sound.play('voice_leave');
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Mute / Deafen
  // ════════════════════════════════════════════════════════════════════════
  mute(): void {
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(0, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('mute');
    if (!this._deafened) this.sound.play('voice_mute');
  }

  unmute(): void {
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(1, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('unmute');
    if (!this._deafened) this.sound.play('voice_unmute');
  }

  deafen(): void {
    this._deafened = true;
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(0, this.audioContext?.currentTime ?? 0);
    }
    if (this.outputGainNode) {
      this.outputGainNode.gain.setValueAtTime(0, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('deafen');
    this.sound.play('voice_deafen');
  }

  undeafen(): void {
    this._deafened = false;
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(1, this.audioContext?.currentTime ?? 0);
    }
    if (this.outputGainNode) {
      this.outputGainNode.gain.setValueAtTime(1, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('undeafen');
    this.sound.play('voice_undeafen');
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Per-User Volume Control
  // ════════════════════════════════════════════════════════════════════════

  /** Set volume for a specific user (0 = mute, 1 = normal, 2 = 200%) */
  setUserVolume(userId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(MAX_VOLUME, volume));
    this.userVolumes.set(userId, clamped);

    const gain = this.remoteGainNodes.get(userId);
    if (gain && this.audioContext) {
      // Smooth ramp to avoid clicks/pops
      gain.gain.linearRampToValueAtTime(clamped, this.audioContext.currentTime + 0.02);
    }

    // Persist to localStorage
    this.saveUserVolumes();
  }

  /** Get volume for a specific user (default 1 = 100%) */
  getUserVolume(userId: string): number {
    return this.userVolumes.get(userId) ?? 1;
  }

  /** Reset a user's volume back to 100% */
  resetUserVolume(userId: string): void {
    this.setUserVolume(userId, 1);
  }

  private saveUserVolumes(): void {
    try {
      const obj: Record<string, number> = {};
      this.userVolumes.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(obj));
    } catch {}
  }

  private loadUserVolumes(): void {
    try {
      const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, number>;
        for (const [k, v] of Object.entries(obj)) {
          this.userVolumes.set(k, v);
        }
      }
    } catch {}
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Per-User Theme Colors (for speaking glow)
  // ════════════════════════════════════════════════════════════════════════

  private getCurrentUserThemeColor(): string {
    try {
      const theme = localStorage.getItem('projectgg_theme');
      if (theme === 'custom') {
        return localStorage.getItem('projectgg_theme_custom') ?? '#00ff88';
      }
      const map: Record<string, string> = {
        green: '#00ff88', red: '#ff5f6d', yellow: '#ffd24d', blue: '#5fb6ff',
      };
      return map[theme ?? 'green'] ?? '#00ff88';
    } catch {
      return '#00ff88';
    }
  }

  getUserThemeColor(userId: string): string {
    return this.userThemeColors.get(userId) ?? '#00ff88';
  }

  setUserThemeColor(userId: string, color: string): void {
    this.userThemeColors.set(userId, color);
  }

  updateThemeColor(color: string): void {
    this.socket?.emit('update-theme-color', { themeColor: color });
  }

  ngOnDestroy(): void {
    this.leaveChannel();
  }
}
