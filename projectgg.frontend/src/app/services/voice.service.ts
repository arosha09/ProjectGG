import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioPlayer: AudioWorkletNode | ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private isConnected = false;
  private currentChannel: { guildId: string; channelId: string } | null = null;

  // Callbacks
  onMemberJoined: ((userId: string) => void) | null = null;
  onMemberLeft: ((userId: string) => void) | null = null;
  onAudioFrame: ((userId: string, audio: ArrayBuffer) => void) | null = null;
  onUserMuted: ((userId: string) => void) | null = null;
  onUserUnmuted: ((userId: string) => void) | null = null;

  constructor(private readonly auth: AuthService) {}

  get connected(): boolean {
    return this.isConnected;
  }

  get currentChannelId(): string | null {
    return this.currentChannel?.channelId ?? null;
  }

  async joinChannel(guildId: string, channelId: string): Promise<void> {
    if (this.isConnected) await this.leaveChannel();

    const wsUrl = environment.apiUrl.replace('http://', 'http://').replace(':3000/api', ':3000');
    this.socket = io(`${wsUrl}/voice`, {
      transports: ['websocket'],
    });

    return new Promise((resolve, reject) => {
      this.socket!.on('connect', async () => {
        try {
          await this.setupAudio();
          this.socket!.emit('join-channel', {
            guildId,
            channelId,
            userId: this.auth.getCurrentUser()?.id,
          });
          this.isConnected = true;
          this.currentChannel = { guildId, channelId };
          this.setupListeners();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      this.socket!.on('connect_error', (err) => {
        reject(err);
      });
    });
  }

  private async setupAudio(): Promise<void> {
    this.audioContext = new AudioContext();

    // Request mic
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    // Create gain node for local monitoring
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;

    // Create destination for capturing mic
    this.destination = this.audioContext.createMediaStreamDestination();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.destination);
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('member-joined', (data: { userId: string }) => {
      this.onMemberJoined?.(data.userId);
    });

    this.socket.on('member-left', (data: { userId: string }) => {
      this.onMemberLeft?.(data.userId);
    });

    this.socket.on('audio-frame', (data: { userId: string; audio: ArrayBuffer }) => {
      this.playAudioFrame(data.audio);
      this.onAudioFrame?.(data.userId, data.audio);
    });

    this.socket.on('user-muted', (data: { userId: string }) => {
      this.onUserMuted?.(data.userId);
    });

    this.socket.on('user-unmuted', (data: { userId: string }) => {
      this.onUserUnmuted?.(data.userId);
    });
  }

  private playAudioFrame(audioData: ArrayBuffer): void {
    if (!this.audioContext) return;
    this.audioContext.decodeAudioData(audioData, (buffer) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext!.destination);
      source.start();
    });
  }

  async leaveChannel(): Promise<void> {
    if (this.socket) {
      this.socket.emit('leave-channel');
      this.socket.disconnect();
      this.socket = null;
    }

    // Cleanup audio
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.isConnected = false;
    this.currentChannel = null;
  }

  mute(): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => (t.enabled = false));
    }
    this.socket?.emit('mute');
  }

  unmute(): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => (t.enabled = true));
    }
    this.socket?.emit('unmute');
  }

  ngOnDestroy(): void {
    this.leaveChannel();
  }
}
