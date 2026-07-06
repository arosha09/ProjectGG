import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Socket } from 'socket.io-client';
import { SoundService } from './sound.service';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import { environment } from '../../environments/environment';

export interface IncomingCall {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  channelId: string | null;
  guildId: string | null;
}

export interface ActiveCall {
  callId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  isOutgoing: boolean;
  channelId: string | null;
  guildId: string | null;
  startedAt: number;
}

export interface QuickReply {
  id: string;
  label: string;
  icon: string;
}

export const QUICK_REPLIES: QuickReply[] = [
  { id: 'busy', label: 'Busy RN', icon: 'schedule' },
  { id: 'later', label: 'Call me later', icon: 'access_time' },
  { id: '10min', label: 'Gimme 10', icon: 'hourglass_empty' },
];

@Injectable({ providedIn: 'root' })
export class CallService implements OnDestroy {
  private socket: Socket | null = null;
  private ringerInterval: any = null;
  private ringerCount = 0;

  private incomingCallSubject = new BehaviorSubject<IncomingCall | null>(null);
  private outgoingCallSubject = new BehaviorSubject<{ calleeId: string; calleeName: string; callId: string } | null>(null);
  private activeCallSubject = new BehaviorSubject<ActiveCall | null>(null);
  private quickReplySubject = new Subject<{ callId: string; message: string }>();
  private callEndedSubject = new Subject<{ callId: string; reason: string }>();
  private navigateToDmSubject = new Subject<string>();

  incomingCall$ = this.incomingCallSubject.asObservable();
  outgoingCall$ = this.outgoingCallSubject.asObservable();
  activeCall$ = this.activeCallSubject.asObservable();
  quickReply$ = this.quickReplySubject.asObservable();
  callEnded$ = this.callEndedSubject.asObservable();
  navigateToDm$ = this.navigateToDmSubject.asObservable();

  constructor(
    private soundService: SoundService,
    private authService: AuthService,
    private chatService: ChatService,
  ) {}

  init(): void {
    this.socket = this.chatService.connect();
    this.setupSocketListeners();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  private showDesktopNotification(data: IncomingCall): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const notif = new Notification(`Incoming Call from ${data.callerName}`, {
      body: data.channelId && data.guildId ? 'Voice Channel Invite' : 'DM Call',
      icon: data.callerAvatar ?? undefined,
      tag: `call-${data.callId}`,
      requireInteraction: true,
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
      this.accept(data.callId);
      this.navigateToDmSubject.next(data.callerId);
    };
  }

  private notifyDesktop(title: string, body: string, tag?: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag, requireInteraction: false });
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('call-incoming', (data: IncomingCall) => {
      this.incomingCallSubject.next(data);
      this.startRinger('incoming');
      this.showDesktopNotification(data);
    });

    this.socket.on('call-accepted', (data: { callId: string; calleeId: string; channelId: string | null; guildId: string | null }) => {
      this.stopRinger();
      const outgoing = this.outgoingCallSubject.value;
      this.outgoingCallSubject.next(null);
      if (outgoing) {
        this.activeCallSubject.next({
          callId: data.callId,
          peerId: outgoing.calleeId,
          peerName: outgoing.calleeName,
          peerAvatar: null,
          isOutgoing: true,
          channelId: data.channelId,
          guildId: data.guildId,
          startedAt: Date.now(),
        });
        this.notifyDesktop('Call Accepted', `${outgoing.calleeName} accepted your call`);
      }
    });

    this.socket.on('call-declined', (data: { callId: string }) => {
      this.stopRinger();
      this.soundService.play('hang_up');
      this.outgoingCallSubject.next(null);
      this.notifyDesktop('Call Declined', 'The other person declined your call');
    });

    this.socket.on('call-quick-reply', (data: { callId: string; message: string }) => {
      this.quickReplySubject.next(data);
      this.notifyDesktop('Quick Reply', data.message);
    });

    this.socket.on('call-ended', (data: { callId: string; reason: string }) => {
      this.stopRinger();
      this.incomingCallSubject.next(null);
      this.outgoingCallSubject.next(null);
      this.activeCallSubject.next(null);
      this.callEndedSubject.next(data);
      this.notifyDesktop('Call Ended', data.reason === 'disconnected' ? 'The other person disconnected' : 'The call has ended');
    });
  }

  private startRinger(type: 'outgoing' | 'incoming' = 'incoming'): void {
    if (this.ringerInterval) return;
    this.ringerCount = 0;
    const play = () => {
      if (type === 'outgoing') {
        this.soundService.play('call_ringing_outgoing');
      } else {
        this.soundService.playIncomingRinger();
      }
    };
    this.ringerInterval = setInterval(() => {
      play();
      this.ringerCount++;
      if (this.ringerCount >= 6) {
        this.stopRinger();
        this.soundService.play('hang_up');
        if (this.incomingCallSubject.value) {
          this.decline(this.incomingCallSubject.value.callId);
        }
        const outgoing = this.outgoingCallSubject.value;
        if (outgoing) {
          this.outgoingCallSubject.next(null);
          this.socket?.emit('call-end', { callId: outgoing.callId });
        }
      }
    }, 2000);
    play();
  }

  private stopRinger(): void {
    if (this.ringerInterval) {
      clearInterval(this.ringerInterval);
      this.ringerInterval = null;
    }
    this.ringerCount = 0;
  }

  initiate(calleeId: string, calleeName: string, channelId?: string, guildId?: string): void {
    if (!this.socket) {
      console.error('[CallService] No socket connected');
      return;
    }
    this.outgoingCallSubject.next({ calleeId, calleeName, callId: 'pending' });
    this.startRinger('outgoing');
    this.socket.emit('call-initiate', { calleeId, channelId, guildId }, (response: { ok: boolean; callId?: string; error?: string }) => {
      if (response.ok && response.callId) {
        this.outgoingCallSubject.next({ calleeId, calleeName, callId: response.callId });
      } else {
        console.error('[CallService] Call initiation failed:', response.error);
        this.outgoingCallSubject.next(null);
        this.stopRinger();
      }
    });
  }

  accept(callId: string): void {
    if (!this.socket) return;
    this.stopRinger();
    this.socket.emit('call-accept', { callId });
    const incoming = this.incomingCallSubject.value;
    if (incoming) {
      this.activeCallSubject.next({
        callId,
        peerId: incoming.callerId,
        peerName: incoming.callerName,
        peerAvatar: incoming.callerAvatar,
        isOutgoing: false,
        channelId: incoming.channelId,
        guildId: incoming.guildId,
        startedAt: Date.now(),
      });
    }
    this.incomingCallSubject.next(null);
  }

  decline(callId: string): void {
    if (!this.socket) return;
    this.stopRinger();
    this.socket.emit('call-decline', { callId });
    this.incomingCallSubject.next(null);
    this.outgoingCallSubject.next(null);
  }

  end(callId: string): void {
    if (!this.socket) return;
    this.stopRinger();
    this.soundService.play('hang_up');
    this.socket.emit('call-end', { callId });
    this.activeCallSubject.next(null);
    this.incomingCallSubject.next(null);
    this.outgoingCallSubject.next(null);
  }

  sendQuickReply(callId: string, message: string): void {
    if (!this.socket) return;
    this.socket.emit('call-quick-reply', { callId, message });
    this.decline(callId);
  }

  get hasActiveCall(): boolean {
    return this.activeCallSubject.value !== null;
  }

  get currentActiveCall(): ActiveCall | null {
    return this.activeCallSubject.value;
  }

  get currentIncomingCall(): IncomingCall | null {
    return this.incomingCallSubject.value;
  }

  get currentOutgoingCall(): { calleeId: string; calleeName: string; callId: string } | null {
    return this.outgoingCallSubject.value;
  }

  ngOnDestroy(): void {
    this.stopRinger();
    if (this.activeCallSubject.value) {
      this.end(this.activeCallSubject.value.callId);
    }
  }
}