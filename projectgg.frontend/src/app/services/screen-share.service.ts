import { Injectable, OnDestroy } from '@angular/core';
import {
  Room, RoomEvent, Track, RemoteTrackPublication, Participant, LocalTrackPublication, TrackPublication,
} from 'livekit-client';
import { Socket } from 'socket.io-client';
import { Subject } from 'rxjs';

export type ScreenShareQuality = '480p' | '720p' | '1080p';

export interface ScreenShareConstraints {
  resolution: { width: number; height: number };
  frameRate: number;
  maxBitrate: number;
}

export const SCREEN_SHARE_PRESETS: Record<ScreenShareQuality, ScreenShareConstraints> = {
  '480p': { resolution: { width: 854, height: 480 }, frameRate: 24, maxBitrate: 600_000 },
  '720p': { resolution: { width: 1280, height: 720 }, frameRate: 30, maxBitrate: 1_500_000 },
  '1080p': { resolution: { width: 1920, height: 1080 }, frameRate: 30, maxBitrate: 3_000_000 },
};

export interface RemoteScreenShare {
  userId: string;
  track: Track;
  publication: RemoteTrackPublication;
  hasAudio: boolean;
  quality: ScreenShareQuality;
  element: HTMLVideoElement;
  audioElement: HTMLAudioElement | null;
}

@Injectable({ providedIn: 'root' })
export class ScreenShareService implements OnDestroy {
  private room: Room | null = null;
  private socket: Socket | null = null;
  private currentQuality: ScreenShareQuality = '720p';
  private currentStream: MediaStream | null = null;
  private publishVideoPublication: LocalTrackPublication | null = null;
  private publishAudioPublication: LocalTrackPublication | null = null;
  private isSharing = false;
  private localUserId: string | null = null;
  private currentSharerUserId: string | null = null;
  private viewerContainer: HTMLElement | null = null;

  readonly remoteShares$ = new Subject<RemoteScreenShare>();
  readonly remoteShareEnded$ = new Subject<string>();
  readonly error$ = new Subject<string>();

  private boundRoomEvents = false;

  attachRoom(room: Room, socket: Socket, userId: string, container: HTMLElement): void {
    this.detachRoom();
    this.room = room;
    this.socket = socket;
    this.localUserId = userId;
    this.viewerContainer = container;
    this.bindRoomEvents();
  }

  detachRoom(): void {
    if (this.isSharing) this.stop();
    if (this.room && this.boundRoomEvents) {
      this.room.off(RoomEvent.TrackSubscribed, this.onTrackSubscribed);
      this.room.off(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed);
      this.room.off(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected);
      this.boundRoomEvents = false;
    }
    this.room = null;
    this.socket = null;
    this.localUserId = null;
    this.viewerContainer = null;
    this.currentSharerUserId = null;
  }

  setQuality(quality: ScreenShareQuality): void {
    this.currentQuality = quality;
  }

  getQuality(): ScreenShareQuality {
    return this.currentQuality;
  }

  isActivelySharing(): boolean {
    return this.isSharing;
  }

  getCurrentStream(): MediaStream | null {
    return this.currentStream;
  }

  getCurrentSharerUserId(): string | null {
    return this.currentSharerUserId;
  }

  async start(options: { quality?: ScreenShareQuality; shareAudio: boolean }): Promise<void> {
    if (!this.room) {
      this.error$.next('Not connected to a voice channel');
      return;
    }
    if (this.isSharing) return;

    const quality = options.quality ?? this.currentQuality;
    const preset = SCREEN_SHARE_PRESETS[quality];
    this.currentQuality = quality;

    let stream: MediaStream;
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: preset.resolution.width },
          height: { ideal: preset.resolution.height },
          frameRate: { ideal: preset.frameRate, max: 30 },
        },
      };
      if (options.shareAudio) {
        constraints.audio = true;
      }
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        return;
      }
      this.error$.next(err?.message ?? 'Failed to capture screen');
      return;
    }

    this.currentStream = stream;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      stream.getTracks().forEach(t => t.stop());
      this.currentStream = null;
      this.error$.next('No video track in captured stream');
      return;
    }

    if (videoTrack.getSettings && !videoTrack.getSettings().displaySurface) {
      // Some browsers don't return displaySurface — that's fine.
    }

    videoTrack.addEventListener('ended', () => {
      this.stop();
    });

    try {
      this.publishVideoPublication = await this.room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        screenShareSimulcastLayers: [
          {
            width: 160,
            height: 120,
            resolution: { width: 160, height: 120 } as any,
            frameRate: 6,
            scalabilityMode: 'L1T1',
          } as any,
          {
            width: 360,
            height: 240,
            resolution: { width: 360, height: 240 } as any,
            frameRate: 12,
            scalabilityMode: 'L1T1',
          } as any,
        ],
        videoCodec: 'vp9',
        videoEncoding: {
          maxBitrate: preset.maxBitrate,
          maxFramerate: preset.frameRate,
        },
        videoSimulcastLayers: [
          {
            width: Math.min(360, preset.resolution.width),
            height: Math.min(202, preset.resolution.height),
            frameRate: 12,
            scalabilityMode: 'L1T1',
            maxBitrate: 200_000,
          } as any,
          {
            width: Math.min(720, preset.resolution.width),
            height: Math.min(405, preset.resolution.height),
            frameRate: 24,
            scalabilityMode: 'L1T1',
            maxBitrate: 600_000,
          } as any,
        ],
      } as any);
    } catch (err: any) {
      stream.getTracks().forEach(t => t.stop());
      this.currentStream = null;
      this.error$.next(err?.message ?? 'Failed to publish screen track');
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      try {
        this.publishAudioPublication = await this.room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
        });
      } catch {
        // Non-fatal — video still works without shared audio.
      }
    }

    this.isSharing = true;
    this.currentSharerUserId = this.localUserId;
    this.socket?.emit('screen-share-start', { quality, hasAudio: !!audioTrack });
  }

  async stop(): Promise<void> {
    if (!this.isSharing || !this.room) {
      this.cleanupLocalStream();
      return;
    }

    const local = this.room.localParticipant;
    if (this.publishVideoPublication?.track) {
      try {
        await local.unpublishTrack(this.publishVideoPublication.track);
      } catch {}
    }
    if (this.publishAudioPublication?.track) {
      try {
        await local.unpublishTrack(this.publishAudioPublication.track);
      } catch {}
    }

    this.cleanupLocalStream();
    this.socket?.emit('screen-share-stop');
    this.socket?.emit('update-theme-color', { themeColor: this.lastThemeColor ?? '#00ff88' });
  }

  private cleanupLocalStream(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.currentStream = null;
    }
    this.publishVideoPublication = null;
    this.publishAudioPublication = null;
    this.isSharing = false;
    this.currentSharerUserId = null;
  }

  private lastThemeColor: string | null = null;
  rememberThemeColor(color: string): void {
    this.lastThemeColor = color;
  }

  private bindRoomEvents(): void {
    if (!this.room || this.boundRoomEvents) return;
    this.room
      .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
      .on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected);
    this.boundRoomEvents = true;
  }

  private onTrackSubscribed = (
    track: Track,
    publication: RemoteTrackPublication,
    participant: Participant,
  ): void => {
    if (track.source !== Track.Source.ScreenShare) return;
    const hasAudio = this.remoteHasAudio(participant);
    const quality = this.currentQuality;

    const videoEl = track.attach() as HTMLVideoElement;
    videoEl.style.display = 'block';
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'contain';
    videoEl.style.background = '#000';
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;

    let audioEl: HTMLAudioElement | null = null;
    const audioPub = participant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (audioPub?.track) {
      audioEl = audioPub.track.attach() as HTMLAudioElement;
      audioEl.autoplay = true;
    }

    this.currentSharerUserId = participant.identity;

    this.remoteShares$.next({
      userId: participant.identity,
      track,
      publication,
      hasAudio,
      quality,
      element: videoEl,
      audioElement: audioEl,
    });
  };

  private remoteHasAudio(participant: Participant): boolean {
    const pub = participant.getTrackPublication(Track.Source.ScreenShareAudio);
    return !!pub?.track;
  }

  private onTrackUnsubscribed = (
    track: Track,
    _pub: RemoteTrackPublication,
    participant: Participant,
  ): void => {
    if (
      track.source === Track.Source.ScreenShare ||
      track.source === Track.Source.ScreenShareAudio
    ) {
      const detached = track.detach();
      detached.forEach(el => {
        try { (el as HTMLElement).remove(); } catch {}
      });
      if (participant.identity === this.currentSharerUserId) {
        this.currentSharerUserId = null;
      }
      this.remoteShareEnded$.next(participant.identity);
    }
  };

  private onParticipantDisconnected = (participant: Participant): void => {
    if (participant.identity === this.currentSharerUserId) {
      this.currentSharerUserId = null;
      this.remoteShareEnded$.next(participant.identity);
    }
  };

  ngOnDestroy(): void {
    this.detachRoom();
  }
}
