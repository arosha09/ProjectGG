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
  private scriptProcessor: ScriptProcessorNode | null = null;
  private speakCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;
  private currentChannel: { guildId: string; channelId: string } | null = null;
  private _deafened = false;
  private _intentionalLeave = false;

  private readonly PCM_SAMPLE_RATE = 16000;

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
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: this.PCM_SAMPLE_RATE },
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

    this.setupPCMCapture(source);
    this.startSpeakingDetection();
  }

  private setupPCMCapture(source: MediaStreamAudioSourceNode): void {
    const bufferSize = 4096;
    this.scriptProcessor = this.audioContext!.createScriptProcessor(bufferSize, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.socket || !this.isConnected || this._deafened) return;

      const inputBuffer = event.inputBuffer.getChannelData(0);
      const inputSampleRate = this.audioContext!.sampleRate;

      const downsampled = this.downsampleBuffer(inputBuffer, inputSampleRate, this.PCM_SAMPLE_RATE);
      const int16 = this.floatTo16BitPCM(downsampled);

      const bytes = new Uint8Array(int16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      this.socket.emit('audio-frame', {
        guildId: this.currentChannel?.guildId,
        channelId: this.currentChannel?.channelId,
        audio: btoa(binary),
      });
    };

    source.connect(this.scriptProcessor);
  }

  private downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
    if (inputSampleRate === outputSampleRate) return buffer;
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const index = i * ratio;
      const low = Math.floor(index);
      const high = Math.min(low + 1, buffer.length - 1);
      const frac = index - low;
      result[i] = buffer[low] * (1 - frac) + buffer[high] * frac;
    }
    return result;
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
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

    this.socket.on('audio-frame', (data: { userId: string; audio: any }) => {
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

  private playAudioFrame(rawAudio: any): void {
    if (!this.audioContext || !this.outputGainNode) return;
    if (!rawAudio) return;

    try {
      let bytes: Uint8Array;

      if (typeof rawAudio === 'string') {
        const binary = atob(rawAudio.trim());
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else if (rawAudio instanceof ArrayBuffer) {
        bytes = new Uint8Array(rawAudio);
      } else if (rawAudio instanceof Uint8Array) {
        bytes = rawAudio;
      } else if (rawAudio instanceof Uint8ClampedArray) {
        bytes = new Uint8Array(rawAudio);
      } else if (rawAudio?.type === 'Buffer' && Array.isArray(rawAudio?.data)) {
        bytes = new Uint8Array(rawAudio.data);
      } else {
        return;
      }

      if (bytes.length < 2) return;
      if (bytes.length % 2 !== 0) {
        bytes = new Uint8Array(bytes.buffer, 0, bytes.length - 1);
      }

      const wavBlob = this.createWavBlob(bytes);
      const ctx = this.audioContext;
      const gain = this.outputGainNode;
      const reader = new FileReader();
      reader.onload = () => {
        ctx.decodeAudioData(reader.result as ArrayBuffer).then((buffer) => {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(gain);
          src.start();
        }).catch((e) => console.warn('[Voice] decodeAudioData error:', e));
      };
      reader.readAsArrayBuffer(wavBlob);
    } catch (e) {
      console.warn('[Voice] playAudioFrame error:', e);
    }
  }

  private createWavBlob(pcmInt16: Uint8Array): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = this.PCM_SAMPLE_RATE * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmInt16.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, this.PCM_SAMPLE_RATE, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    new Uint8Array(buffer, 44).set(pcmInt16);

    return new Blob([buffer], { type: 'audio/wav' });
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
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

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
