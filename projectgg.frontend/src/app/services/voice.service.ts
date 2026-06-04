import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Room, RoomEvent, Track, Participant, RemoteTrackPublication } from 'livekit-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { StatusNotificationService } from './notification.service';
import { SoundService } from './sound.service';

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private socket: Socket | null = null;
  private room: Room | null = null;
  private isConnected = false;
  private currentChannel: { guildId: string; channelId: string } | null = null;
  private _deafened = false;
  private audioContext: AudioContext | null = null;
  private outputGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private highpassNode: BiquadFilterNode | null = null;

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

  constructor(
    private readonly auth: AuthService,
    private readonly notification: StatusNotificationService,
    private readonly sound: SoundService,
  ) {}

  get connected(): boolean {
    return this.isConnected;
  }

  get currentChannelId(): string | null {
    return this.currentChannel?.channelId ?? null;
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
          });

          await this.connectToLiveKit(guildId, channelId);

          this.isConnected = true;
          this.currentChannel = { guildId, channelId };
          this.sound.play('voice_join');
          clearTimeout(timeout);
          resolve();
        } catch (e) {
          clearTimeout(timeout);
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

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.bindRoomEvents();

    await this.room.connect(wsUrl, token);
    console.log('[Voice] LiveKit room connected');

    await this.room.localParticipant.setMicrophoneEnabled(true);

    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-24, this.audioContext.currentTime);
    this.compressorNode.knee.setValueAtTime(10, this.audioContext.currentTime);
    this.compressorNode.ratio.setValueAtTime(6, this.audioContext.currentTime);
    this.compressorNode.attack.setValueAtTime(0.003, this.audioContext.currentTime);
    this.compressorNode.release.setValueAtTime(0.15, this.audioContext.currentTime);

    this.highpassNode = this.audioContext.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.setValueAtTime(80, this.audioContext.currentTime);
    this.highpassNode.Q.setValueAtTime(0.7, this.audioContext.currentTime);

    this.outputGainNode = this.audioContext.createGain();
    this.outputGainNode.gain.value = 1;

    this.highpassNode.connect(this.compressorNode);
    this.compressorNode.connect(this.outputGainNode);
    this.outputGainNode.connect(this.audioContext.destination);
  }

  private bindRoomEvents(): void {
    if (!this.room) return;

    this.room
      .on(RoomEvent.Connected, () => {
        console.log('[Voice] LiveKit connected');
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('[Voice] LiveKit disconnected');
        if (this.isConnected) {
          this.leaveChannel();
        }
      })
      .on(RoomEvent.TrackSubscribed, (track: Track, _pub: RemoteTrackPublication, participant: Participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = 'none';
          document.body.appendChild(el);
          if (this.audioContext && this.highpassNode) {
            const source = this.audioContext.createMediaElementSource(el);
            source.connect(this.highpassNode);
          }
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        track.detach().forEach(el => el.remove());
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (!this.room) return;
        const speakerIds = new Set(speakers.map(s => s.identity));

        const localId = this.auth.getCurrentUser()?.id;
        if (localId) {
          const isLocalSpeaking = this.room.localParticipant.isSpeaking;
          this.onLocalSpeaking?.(isLocalSpeaking);
        }

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

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('member-joined', (data: { userId: string; channelId: string; muted: boolean; deafened: boolean }) => {
      this.onMemberJoined?.(data.userId, data.channelId, data.muted, data.deafened);
    });

    this.socket.on('member-left', (data: { userId: string; channelId: string }) => {
      this.onMemberLeft?.(data.userId, data.channelId);
    });

    this.socket.on('existing-members', (data: { members: { userId: string; muted: boolean; deafened: boolean }[] }) => {
      this.onExistingMembers?.(data.members);
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

    this.socket.on('all-voice-state', (data: { channels: { channelId: string; users: { userId: string; muted: boolean; deafened: boolean; speaking: boolean }[] }[] }) => {
      this.onAllVoiceState?.(data.channels);
    });

    this.socket.on('voice-nudge', (data: { fromUserId: string; fromUsername: string }) => {
      this.onVoiceNudge?.(data.fromUserId, data.fromUsername);
    });
  }

  async leaveChannel(): Promise<void> {
    this.isConnected = false;

    if (this.room) {
      this.room.disconnect().catch(() => {});
      this.room = null;
    }

    if (this.outputGainNode) {
      this.outputGainNode.disconnect();
      this.outputGainNode = null;
    }
    if (this.compressorNode) {
      this.compressorNode.disconnect();
      this.compressorNode = null;
    }
    if (this.highpassNode) {
      this.highpassNode.disconnect();
      this.highpassNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.socket) {
      this.socket.emit('leave-channel');
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentChannel = null;
    this._deafened = false;
    this.sound.play('voice_leave');
  }

  mute(): void {
    this.room?.localParticipant?.setMicrophoneEnabled(false).catch(() => {});
    this.socket?.emit('mute');
    if (!this._deafened) this.sound.play('voice_mute');
  }

  unmute(): void {
    this.room?.localParticipant?.setMicrophoneEnabled(true).catch(() => {});
    this.socket?.emit('unmute');
    if (!this._deafened) this.sound.play('voice_unmute');
  }

  deafen(): void {
    this._deafened = true;
    this.room?.localParticipant?.setMicrophoneEnabled(false).catch(() => {});
    if (this.outputGainNode) {
      this.outputGainNode.gain.setValueAtTime(0, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('deafen');
    this.sound.play('voice_deafen');
  }

  undeafen(): void {
    this._deafened = false;
    this.room?.localParticipant?.setMicrophoneEnabled(true).catch(() => {});
    if (this.outputGainNode) {
      this.outputGainNode.gain.setValueAtTime(1, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('undeafen');
    this.sound.play('voice_undeafen');
  }

  ngOnDestroy(): void {
    this.leaveChannel();
  }
}
