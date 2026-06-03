import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { StatusNotificationService } from './notification.service';
import { SoundService } from './sound.service';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private gainNode: GainNode | null = null;
  private outputGainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private speakCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;
  private currentChannel: { guildId: string; channelId: string } | null = null;
  private _deafened = false;
  private _intentionalLeave = false;

  private peers = new Map<string, RTCPeerConnection>();
  private remoteSources = new Map<string, MediaStreamAudioSourceNode>();

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
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);

      this.socket!.on('connect', async () => {
        try {
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

    this.startSpeakingDetection();
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const existing = this.peers.get(remoteUserId);
    if (existing) {
      existing.close();
      this.peers.delete(remoteUserId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peers.set(remoteUserId, pc);

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        pc.addTrack(track, this.mediaStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('webrtc-ice-candidate', {
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onicecandidateerror = (event) => {
      console.warn('[Voice] ICE candidate error for', remoteUserId, event);
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.attachRemoteStream(remoteUserId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Voice] PC state for', remoteUserId, ':', pc.connectionState, pc.iceConnectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close();
        this.peers.delete(remoteUserId);
        this.remoteSources.delete(remoteUserId);
      }
    };

    return pc;
  }

  private attachRemoteStream(remoteUserId: string, stream: MediaStream): void {
    if (!this.audioContext || !this.outputGainNode) return;
    if (stream.getAudioTracks().length === 0) return;

    const existing = this.remoteSources.get(remoteUserId);
    if (existing) return;

    const remoteSource = this.audioContext.createMediaStreamSource(stream);
    remoteSource.connect(this.outputGainNode);
    this.remoteSources.set(remoteUserId, remoteSource);
  }

  private async createOffer(remoteUserId: string): Promise<void> {
    const pc = this.createPeerConnection(remoteUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket?.emit('webrtc-offer', {
      targetUserId: remoteUserId,
      offer: pc.localDescription!.toJSON(),
    });
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
      const pc = this.peers.get(data.userId);
      if (pc) {
        pc.close();
        this.peers.delete(data.userId);
      }
      const src = this.remoteSources.get(data.userId);
      if (src) {
        src.disconnect();
        this.remoteSources.delete(data.userId);
      }
      this.onMemberLeft?.(data.userId, data.channelId);
    });

    this.socket.on('existing-members', (data: { members: { userId: string; muted: boolean; deafened: boolean }[] }) => {
      this.onExistingMembers?.(data.members);
      data.members.forEach(m => this.createOffer(m.userId));
    });

    this.socket.on('webrtc-offer', async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      console.log('[Voice] Received offer from', data.fromUserId);
      const pc = this.createPeerConnection(data.fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket?.emit('webrtc-answer', {
        targetUserId: data.fromUserId,
        answer: pc.localDescription!.toJSON(),
      });
    });

    this.socket.on('webrtc-answer', async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      console.log('[Voice] Received answer from', data.fromUserId);
      const pc = this.peers.get(data.fromUserId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    this.socket.on('webrtc-ice-candidate', async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const pc = this.peers.get(data.fromUserId);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn('[Voice] Failed to add ICE candidate from', data.fromUserId, e);
        }
      }
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

  async leaveChannel(): Promise<void> {
    if (this.speakCheckInterval) {
      clearInterval(this.speakCheckInterval);
      this.speakCheckInterval = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    this.remoteSources.forEach(src => src.disconnect());
    this.remoteSources.clear();

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
