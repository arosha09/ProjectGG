import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { StatusNotificationService } from './notification.service';
import { SoundService } from './sound.service';

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private gainNode: GainNode | null = null;
  private outputGainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private audioRecorder: MediaRecorder | null = null;
  private speakCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;
  private currentChannel: { guildId: string; channelId: string } | null = null;
  private _deafened = false;
  private _intentionalLeave = false;

  onMemberJoined: ((userId: string, channelId: string, muted: boolean, deafened: boolean) => void) | null = null;
  onMemberLeft: ((userId: string, channelId: string) => void) | null = null;
  onExistingMembers: ((members: { userId: string; muted: boolean; deafened: boolean }[]) => void) | null = null;
  onAudioFrame: ((userId: string, audio: ArrayBuffer) => void) | null = null;
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
    this._intentionalLeave = false;
    if (this.isConnected) await this.leaveChannel();

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
          console.log('[Voice] Connected via', transport);
          this.setupListeners();

          const micOk = await this.setupAudio().then(() => true).catch(() => false);
          if (!micOk) {
            this.onMicPermissionError?.('Microphone access is required for voice chat. Please allow mic permissions and reload.');
          }

          this.socket!.emit('join-channel', {
            guildId,
            channelId,
            userId: this.auth.getCurrentUser()?.id,
          });

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

  private async setupAudio(): Promise<void> {
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1;

    this.outputGainNode = this.audioContext.createGain();
    this.outputGainNode.gain.value = 1;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.gainNode);

    this.outputGainNode.connect(this.audioContext.destination);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;
    source.connect(this.analyser);

    this.audioRecorder = new MediaRecorder(this.mediaStream, { mimeType: 'audio/webm' });
    this.audioRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.socket && this.isConnected && !this._deafened) {
        e.data.arrayBuffer().then((buffer) => {
          if (this.socket && this.isConnected) {
            this.socket.emit('audio-frame', {
              guildId: this.currentChannel?.guildId,
              channelId: this.currentChannel?.channelId,
              audio: buffer,
            });
          }
        });
      }
    };
    this.audioRecorder.start(100);

    this.startSpeakingDetection();
  }

  private startSpeakingDetection(): void {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let wasSpeaking = false;
    let wasLocalSpeaking = false;
    const threshold = 15;

    this.speakCheckInterval = setInterval(() => {
      if (!this.analyser || !this.isConnected) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      const isSpeaking = avg > threshold;

      if (this.socket) {
        if (isSpeaking && !wasSpeaking) {
          this.socket.emit('speaking');
        } else if (!isSpeaking && wasSpeaking) {
          this.socket.emit('stopped-speaking');
        }
      }
      wasSpeaking = isSpeaking;

      if (isSpeaking !== wasLocalSpeaking) {
        wasLocalSpeaking = isSpeaking;
        this.onLocalSpeaking?.(isSpeaking);
      }
    }, 150);
  }

  private setupListeners(): void {
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

    this.socket.on('audio-frame', (data: { userId: string; audio: ArrayBuffer }) => {
      console.log('[Voice] Received audio-frame from', data.userId, 'size:', data.audio?.byteLength);
      this.playAudioFrame(data.audio);
      this.onAudioFrame?.(data.userId, data.audio);
    });

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

  private playAudioFrame(audioData: ArrayBuffer): void {
    if (!this.audioContext || !this.outputGainNode) {
      console.warn('[Voice] playAudioFrame: audioContext or outputGainNode is null');
      return;
    }
    if (!audioData || audioData.byteLength === 0) {
      console.warn('[Voice] playAudioFrame: empty audio data');
      return;
    }
    const ctx = this.audioContext;
    const gain = this.outputGainNode;
    ctx.decodeAudioData(audioData).then((buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start();
      console.log('[Voice] Playing audio frame, duration:', buffer.duration.toFixed(2), 's');
    }).catch((err) => {
      console.error('[Voice] decodeAudioData failed:', err);
    });
  }

  async leaveChannel(): Promise<void> {
    if (this.speakCheckInterval) {
      clearInterval(this.speakCheckInterval);
      this.speakCheckInterval = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioRecorder && this.audioRecorder.state !== 'inactive') {
      this.audioRecorder.stop();
    }
    this.audioRecorder = null;

    this.isConnected = false;

    if (this.socket) {
      this.socket.emit('leave-channel');
      this.socket.disconnect();
      this.socket = null;
    }

    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.isConnected = false;
    this.currentChannel = null;
    this._deafened = false;
    this.sound.play('voice_leave');
  }

  mute(): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => { t.enabled = false; });
    }
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(0, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('mute');
    if (!this._deafened) this.sound.play('voice_mute');
  }

  unmute(): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => { t.enabled = true; });
    }
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(1, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('unmute');
    if (!this._deafened) this.sound.play('voice_unmute');
  }

  deafen(): void {
    this._deafened = true;
    this.mute();
    if (this.outputGainNode) {
      this.outputGainNode.gain.setValueAtTime(0, this.audioContext?.currentTime ?? 0);
    }
    this.socket?.emit('deafen');
    this.sound.play('voice_deafen');
  }

  undeafen(): void {
    this._deafened = false;
    this.unmute();
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
