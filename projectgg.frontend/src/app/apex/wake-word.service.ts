import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, BehaviorSubject, firstValueFrom } from 'rxjs';
import { ApexVoiceService, VoiceFingerprint } from './apex-voice.service';

export type WakeWordState = 'idle' | 'listening' | 'wake-detected' | 'verifying' | 'unauthorized' | 'command-recording' | 'transcribing' | 'error';

const WAKE_PHRASES = [
  'hey apex',
  'okay apex',
  'ok apex',
  'hello apex',
  'yo apex',
  'sup apex',
  'hi apex',
];

@Injectable({ providedIn: 'root' })
export class WakeWordService implements OnDestroy {
  private recognition: any = null;
  private restartTimeout: any = null;
  private commandGraceTimeout: any = null;
  private commandRecordTimeout: any = null;
  private micStream: MediaStream | null = null;

  // Rolling buffer for wake word detection
  private rollingRecorder: MediaRecorder | null = null;
  private rollingChunks: Blob[] = [];
  private rollingBuffer: Blob[] = [];
  private rollingRestartTimer: any = null;

  // Command recording (separate from rolling)
  private commandRecorder: MediaRecorder | null = null;
  private commandChunks: Blob[] = [];

  private hasVoiceProfile = false;

  private stateSubject = new BehaviorSubject<WakeWordState>('idle');
  public state$ = this.stateSubject.asObservable();

  private wakeDetectedSubject = new Subject<void>();
  public wakeDetected$ = this.wakeDetectedSubject.asObservable();

  private commandSubject = new Subject<string>();
  public commandReceived$ = this.commandSubject.asObservable();

  private liveTranscriptSubject = new BehaviorSubject<string>('');
  public liveTranscript$ = this.liveTranscriptSubject.asObservable();

  private listeningSubject = new BehaviorSubject<boolean>(false);
  public listening$ = this.listeningSubject.asObservable();

  private isRunning = false;
  private isStarting = false;

  get isActive(): boolean {
    return this.stateSubject.value !== 'idle';
  }

  get currentState(): WakeWordState {
    return this.stateSubject.value;
  }

  constructor(
    private http: HttpClient,
    private voiceAnalysis: ApexVoiceService,
  ) {}

  // MUST be called synchronously in user gesture
  start(): void {
    if (this.isRunning) return;
    this.cleanup();
    this.isRunning = true;
    this.stateSubject.next('listening');

    // Get mic stream
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        
        this.micStream = stream;
        this.startWakeDetectionRecorder();
      })
      .catch(err => {
        
        this.stateSubject.next('error');
        this.isRunning = false;
      });

    // Profile check — runs in background
    this.loadProfileAsync();
  }

  private wakeDetectionChunks: Blob[] = [];
  private wakeDetectionRecorder: MediaRecorder | null = null;
  private wakeDetectionInterval: ReturnType<typeof setInterval> | null = null;
  private lastTranscribeTime = 0;
  private lastWakeTime = 0;

  private startWakeDetectionRecorder(): void {
    if (!this.micStream) return;
    this.wakeDetectionChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';

    this.wakeDetectionRecorder = new MediaRecorder(this.micStream, { mimeType });

    this.wakeDetectionRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.wakeDetectionChunks.push(e.data);
    };

    this.wakeDetectionRecorder.onstop = async () => {
      if (!this.isRunning) return;
      const now = Date.now();
      if (now - this.lastTranscribeTime < 3000) {
        if (this.isRunning) this.startWakeDetectionRecorder();
        return;
      }
      const blob = new Blob(this.wakeDetectionChunks, { type: mimeType });
      if (blob.size < 1000) {
        if (this.isRunning) this.startWakeDetectionRecorder();
        return;
      }
      this.lastTranscribeTime = now;
      await this.checkWakeDetection(blob);
      if (this.isRunning) this.startWakeDetectionRecorder();
    };

    this.wakeDetectionRecorder.start();

    this.wakeDetectionInterval = setTimeout(() => {
      if (this.wakeDetectionRecorder?.state === 'recording') {
        this.wakeDetectionRecorder.stop();
      }
    }, 4000);
  }

  private async checkWakeDetection(blob: Blob): Promise<void> {
    try {
      const base64 = await this.voiceAnalysis.blobToBase64(blob);
      const res: any = await firstValueFrom(
        this.http.post('/api/ai/transcribe', { audio: base64 })
      );
      const transcript = (res?.transcript || '').toLowerCase().trim();
      this.liveTranscriptSubject.next(transcript || '(silence)');
      if (transcript && this.matchesWakePhrase(transcript)) {
        const now = Date.now();
        if (now - this.lastWakeTime < 5000) return;
        this.lastWakeTime = now;
        this.onWakeDetected();
      }
    } catch {}
  }

  private stopWakeDetectionRecorder(): void {
    if (this.wakeDetectionInterval !== null) {
      clearTimeout(this.wakeDetectionInterval);
      this.wakeDetectionInterval = null;
    }
    if (this.wakeDetectionRecorder?.state === 'recording') {
      try { this.wakeDetectionRecorder.stop(); } catch {}
    }
    this.wakeDetectionRecorder = null;
  }

  private async loadProfileAsync(): Promise<void> {
    // Check voice profile in background
    try {
      const p: any = await firstValueFrom(this.http.get('/api/ai/voice/profile'));
      this.hasVoiceProfile = !!(p?.status?.completed);
      
    } catch (err) {
      this.hasVoiceProfile = false;
      
    }
  }

  private cleanup(): void {
    clearTimeout(this.restartTimeout);
    clearTimeout(this.commandGraceTimeout);
    clearTimeout(this.commandRecordTimeout);
    clearTimeout(this.rollingRestartTimer);
    this.stopWakeDetectionRecorder();
    this.stopRollingRecorder();
    this.stopCommandRecorder();
    this.stopMic();
  }

  stop(): void {
    this.cleanup();
    this.isRunning = false;
    this.isStarting = false;
    this.stateSubject.next('idle');
    this.listeningSubject.next(false);
    this.liveTranscriptSubject.next('');
  }

  // ─── Rolling buffer (wake word detection audio) ───────────────────────────

  private startRollingRecorder(): void {
    if (!this.micStream) return;
    this.rollingChunks = [];
    this.rollingBuffer = [];

    try {
      this.rollingRecorder = new MediaRecorder(this.micStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });

      this.rollingRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.rollingChunks.push(e.data);
          this.rollingBuffer.push(e.data);
          this.trimRollingBuffer();
        }
      };

      this.rollingRecorder.start();
      this.scheduleRollingRestart();
    } catch (err) {
      
    }
  }

  private scheduleRollingRestart(): void {
    this.rollingRestartTimer = setTimeout(() => {
      if (this.rollingRecorder?.state === 'recording') {
        this.rollingRecorder.stop();
        this.rollingChunks = [];
        try {
          this.rollingRecorder.start();
          this.scheduleRollingRestart();
    } catch (err) {
      this.liveTranscriptSubject.next('(error)');
    }
  }
    }, 1000);
  }

  private stopRollingRecorder(): void {
    clearTimeout(this.rollingRestartTimer);
    if (this.rollingRecorder?.state === 'recording') {
      try { this.rollingRecorder.stop(); } catch {}
    }
    this.rollingRecorder = null;
    this.rollingChunks = [];
    this.rollingBuffer = [];
  }

  private trimRollingBuffer(): void {
    const maxBytes = 80_000;
    let totalSize = 0;
    let startIdx = 0;
    for (let i = this.rollingBuffer.length - 1; i >= 0; i--) {
      totalSize += this.rollingBuffer[i].size;
      if (totalSize > maxBytes) { startIdx = i + 1; break; }
    }
    if (startIdx > 0) this.rollingBuffer = this.rollingBuffer.slice(startIdx);
  }

  // ─── Command recording (uses same mic stream, separate recorder) ─────────

  private commandAnalyser: AnalyserNode | null = null;
  private commandSilenceTimer: ReturnType<typeof setTimeout> | null = null;
  private commandLevelCheckId: number | null = null;

  private startCommandRecording(): void {
    if (!this.micStream) {
      this.returnToWakeListening();
      return;
    }

    this.commandChunks = [];

    this.stopRollingRecorder();
    this.stopWakeDetectionRecorder();

    try {
      this.commandRecorder = new MediaRecorder(this.micStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });

      this.commandRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.commandChunks.push(e.data);
      };

      this.commandRecorder.onstop = () => {
        this.stopCommandLevelMonitor();
        this.processCommand();
      };

      this.commandRecorder.start();
      this.stateSubject.next('command-recording');
      this.listeningSubject.next(true);

      this.startCommandLevelMonitor();

      this.commandRecordTimeout = setTimeout(() => {
        if (this.commandRecorder?.state === 'recording') {
          this.commandRecorder.stop();
        }
      }, 10000);
    } catch {
      this.returnToWakeListening();
    }
  }

  private startCommandLevelMonitor(): void {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(this.micStream!);
      this.commandAnalyser = ctx.createAnalyser();
      this.commandAnalyser.fftSize = 512;
      source.connect(this.commandAnalyser);

      const dataArray = new Uint8Array(this.commandAnalyser.frequencyBinCount);
      let silenceStart = 0;
      const SILENCE_THRESHOLD = 15;
      const SILENCE_TIMEOUT = 1500;

      const check = () => {
        if (!this.commandAnalyser) return;
        this.commandAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        if (avg < SILENCE_THRESHOLD) {
          if (silenceStart === 0) silenceStart = Date.now();
          else if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
            if (this.commandRecorder?.state === 'recording') {
              this.commandRecorder.stop();
            }
            return;
          }
        } else {
          silenceStart = 0;
        }
        this.commandLevelCheckId = requestAnimationFrame(check);
      };
      this.commandLevelCheckId = requestAnimationFrame(check);
    } catch {}
  }

  private stopCommandLevelMonitor(): void {
    if (this.commandLevelCheckId !== null) {
      cancelAnimationFrame(this.commandLevelCheckId);
      this.commandLevelCheckId = null;
    }
    if (this.commandSilenceTimer) {
      clearTimeout(this.commandSilenceTimer);
      this.commandSilenceTimer = null;
    }
    this.commandAnalyser = null;
  }

  private stopCommandRecorder(): void {
    this.stopCommandLevelMonitor();
    clearTimeout(this.commandRecordTimeout);
    if (this.commandRecorder?.state === 'recording') {
      try { this.commandRecorder.stop(); } catch {}
    }
    this.commandRecorder = null;
    this.commandChunks = [];
  }

  private async processCommand(): Promise<void> {
    this.listeningSubject.next(false);
    this.stateSubject.next('transcribing');

    const blob = new Blob(this.commandChunks, { type: 'audio/webm' });
    this.commandChunks = [];

    if (blob.size < 1000) {
      
      this.returnToWakeListening();
      return;
    }

    try {
      const base64 = await this.voiceAnalysis.blobToBase64(blob);
      const res: any = await firstValueFrom(
        this.http.post('/api/ai/transcribe', { audio: base64 })
      );
      const transcript = res?.transcript || '';
      

      if (transcript.trim()) {
        this.liveTranscriptSubject.next(transcript);
        this.commandSubject.next(transcript.trim());
      }
    } catch (err) {
      
    }

    this.liveTranscriptSubject.next('');
    this.returnToWakeListening();
  }

  // ─── Mic management ──────────────────────────────────────────────────────

  private stopMic(): void {
    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
  }

  // ─── SpeechRecognition (wake word detection only) ────────────────────────

  private startRecognition(): void {
    if (!this.recognition) return;
    try {
      this.recognition.start();
      this.isRunning = true;
      this.isStarting = false;
      this.stateSubject.next('listening');
    } catch {}
  }

  private stopRecognition(): void {
    if (this.recognition) {
      try { this.recognition.stop(); } catch {}
      this.recognition = null;
    }
  }

  private handleResult(event: any): void {
    const state = this.stateSubject.value;
    if (state === 'command-recording' || state === 'transcribing') return;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      for (let alt = 0; alt < result.length; alt++) {
        const altText = result[alt].transcript.toLowerCase().trim();
        if (this.matchesWakePhrase(altText)) {

          this.onWakeDetected();
          return;
        }
      }
    }
  }

  // ─── Wake word detection flow ────────────────────────────────────────────

  private async onWakeDetected(): Promise<void> {
    this.stopWakeDetectionRecorder();

    this.stateSubject.next('wake-detected');
    this.wakeDetectedSubject.next();
    this.liveTranscriptSubject.next('');

    this.rollingBuffer = [...this.wakeDetectionChunks];

    if (!this.hasVoiceProfile) {
      this.playWakeSound();
      this.startCommandRecording();
      return;
    }

    this.stateSubject.next('verifying');

    try {
      const verified = await this.verifySpeaker();
      if (verified) {
        this.playWakeSound();
        this.startCommandRecording();
      } else {
        this.returnToWakeListening();
      }
    } catch {
      this.playWakeSound();
      this.startCommandRecording();
    }
  }

  private returnToWakeListening(): void {
    clearTimeout(this.commandGraceTimeout);
    this.liveTranscriptSubject.next('');
    this.rollingBuffer = [];

    if (this.stateSubject.value !== 'idle' && this.isRunning) {
      this.stateSubject.next('listening');
      // Restart wake detection recorder
      if (this.micStream) {
        this.startWakeDetectionRecorder();
      }
    }
  }

  // ─── Speaker verification ────────────────────────────────────────────────

  private async verifySpeaker(): Promise<boolean> {
    if (this.rollingBuffer.length === 0) return false;

    const audioBlob = new Blob(this.rollingBuffer, { type: 'audio/webm' });
    const fingerprint = await this.voiceAnalysis.extractFingerprint(audioBlob);

    const result: any = await firstValueFrom(
      this.http.post('/api/ai/voice/verify', { fingerprint })
    );
    return result?.verified === true;
  }

  // ─── Phrase matching ─────────────────────────────────────────────────────

  private matchesWakePhrase(text: string): boolean {
    const normalized = text.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ');
    if (words.length > 5) return false;
    return WAKE_PHRASES.some(phrase => {
      if (normalized === phrase) return true;
      if (normalized.startsWith(phrase)) return true;
      return this.fuzzyMatch(normalized, phrase, 1);
    });
  }

  private fuzzyMatch(input: string, target: string, maxEdits: number): boolean {
    if (input.length === 0) return target.length <= maxEdits;
    if (target.length === 0) return input.length <= maxEdits;
    if (Math.abs(input.length - target.length) > maxEdits) return false;
    let edits = 0;
    let i = 0;
    let j = 0;
    while (i < input.length && j < target.length) {
      if (input[i] === target[j]) { i++; j++; }
      else {
        edits++;
        if (edits > maxEdits) return false;
        if (i + 1 < input.length && input[i + 1] === target[j]) i++;
        else if (j + 1 < target.length && input[i] === target[j + 1]) j++;
        else { i++; j++; }
      }
    }
    edits += (input.length - i) + (target.length - j);
    return edits <= maxEdits;
  }

  // ─── Sounds ──────────────────────────────────────────────────────────────

  private playWakeSound(): void {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close(), 300);
    } catch {}
  }

  private playUnauthorizedSound(): void {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 330;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 400);
    } catch {}
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
