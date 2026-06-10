import { Component, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ApexVoiceService, VoiceFingerprint } from '../apex-voice.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-voice-training',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './voice-training.component.html',
  styleUrls: ['./voice-training.component.scss'],
})
export class VoiceTrainingComponent {
  @Output() close = new EventEmitter<void>();

  trainingPhrases = [
    'Hey APEX, what\'s up?',
    'Hello, how are you doing?',
    'Can you help me with something?',
    'What\'s the weather like today?',
    'Thanks APEX, have a good one!',
  ];

  currentStep = 0;
  isRecording = false;
  isTranscribing = false;
  trainingComplete = false;
  progress = 0;
  statusMessage = '';
  mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  private pendingBlob: Blob | null = null;
  private pendingFingerprint: VoiceFingerprint | null = null;
  private collectedFingerprints: VoiceFingerprint[] = [];
  previewUrl: string | null = null;
  recognizedText = '';

  constructor(
    private voiceService: ApexVoiceService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  get currentPhrase(): string {
    return this.trainingPhrases[this.currentStep] || '';
  }

  get progressPercent(): number {
    return (this.progress / 5) * 100;
  }

  get isPreview(): boolean {
    return this.previewUrl !== null && !this.isRecording;
  }

  async startRecording(): Promise<void> {
    if (this.isRecording || this.isPreview || this.isTranscribing) return;

    this.discardPending();
    this.recognizedText = '';

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processRecording();
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.statusMessage = 'Recording... Read the phrase above.';
      this.cdr.markForCheck();

      setTimeout(() => {
        if (this.mediaRecorder?.state === 'recording') {
          this.stopRecording();
        }
      }, 8000);
    } catch (error) {
      this.statusMessage = 'Microphone access denied. Please allow microphone access.';
      this.cdr.markForCheck();
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
    this.cdr.markForCheck();
  }

  private async processRecording(): Promise<void> {
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });

    if (blob.size < 1000) {
      this.statusMessage = 'Recording too short. Tap the mic to try again.';
      this.discardPending();
      this.cdr.markForCheck();
      return;
    }

    // Release mic while we transcribe
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    // Transcribe with Whisper
    this.isTranscribing = true;
    this.statusMessage = 'Listening...';
    this.cdr.markForCheck();

    try {
      const base64 = await this.voiceService.blobToBase64(blob);
      const res: any = await this.http
        .post('/api/ai/transcribe', { audio: base64 })
        .toPromise();
      this.recognizedText = res?.transcript || '';
      console.log('[VoiceTraining] Whisper transcript:', this.recognizedText);
    } catch (err) {
      console.error('[VoiceTraining] Transcription failed:', err);
      this.recognizedText = '';
    }

    this.isTranscribing = false;
    this.cdr.markForCheck();

    // Validate phrase match
    if (!this.recognizedText || this.recognizedText.trim().length < 3) {
      this.statusMessage = 'Couldn\'t hear you clearly. Please try again, speak a bit louder.';
      this.discardPending();
      this.recognizedText = '';
      this.cdr.markForCheck();
      return;
    }

    const score = this.phraseMatchScore(this.currentPhrase, this.recognizedText);
    if (score < 0.7) {
      this.statusMessage = `I heard "${this.recognizedText}" — that doesn't match. Please read the phrase above.`;
      this.discardPending();
      this.recognizedText = '';
      this.cdr.markForCheck();
      return;
    }

    // Phrase matched — analyze voice fingerprint and show preview
    try {
      this.statusMessage = 'Analyzing your voice...';
      this.cdr.markForCheck();

      this.pendingFingerprint = await this.voiceService.extractFingerprint(blob);
      this.pendingBlob = blob;
      this.previewUrl = URL.createObjectURL(blob);
      this.statusMessage = 'Press play to review your recording.';
      this.cdr.markForCheck();
    } catch (error) {
      this.statusMessage = 'Something went wrong. Tap the mic to try again.';
      this.discardPending();
      this.cdr.markForCheck();
    }
  }

  async acceptRecording(): Promise<void> {
    if (!this.pendingBlob || !this.pendingFingerprint) return;

    const blob = this.pendingBlob;
    const fingerprint = this.pendingFingerprint;
    this.discardPending();

    try {
      this.statusMessage = 'Uploading recording...';
      this.cdr.markForCheck();

      const base64 = await this.voiceService.blobToBase64(blob);

      this.collectedFingerprints.push(fingerprint);

      const isLastRecording = this.currentStep >= 4;

      await this.http.post('/api/ai/voice/upload', {
        audio: base64,
        index: this.currentStep,
        fingerprint: isLastRecording ? this.averageFingerprints(this.collectedFingerprints) : fingerprint,
      }).toPromise();

      this.progress = this.currentStep + 1;
      this.statusMessage = `Recording ${this.progress}/5 saved.`;
      this.cdr.markForCheck();

      if (!isLastRecording) {
        setTimeout(() => {
          this.currentStep++;
          this.statusMessage = '';
          this.cdr.markForCheck();
        }, 1500);
      } else {
        this.collectedFingerprints = [];
        this.trainingComplete = true;
        this.statusMessage = 'Voice training complete! APEX now recognizes your voice.';
        this.cdr.markForCheck();
      }
    } catch (error) {
      this.statusMessage = 'Upload failed. Tap the mic to try again.';
      this.cdr.markForCheck();
    }
  }

  discardRecording(): void {
    this.discardPending();
    this.isRecording = false;
    this.statusMessage = 'Tap the mic to re-record.';
    this.cdr.markForCheck();
  }

  private discardPending(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    this.pendingBlob = null;
    this.pendingFingerprint = null;
  }

  async recalibrate(): Promise<void> {
    this.discardPending();
    this.collectedFingerprints = [];
    this.currentStep = 0;
    this.progress = 0;
    this.trainingComplete = false;
    this.statusMessage = '';
    this.cdr.markForCheck();
  }

  async deleteProfile(): Promise<void> {
    try {
      await this.http.delete('/api/ai/voice/profile').toPromise();
      this.discardPending();
      this.currentStep = 0;
      this.progress = 0;
      this.trainingComplete = false;
      this.statusMessage = 'Voice profile deleted.';
      this.cdr.markForCheck();
    } catch (error) {
      this.statusMessage = 'Could not delete profile. Try again.';
      this.cdr.markForCheck();
    }
  }

  onClose(): void {
    this.discardPending();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.close.emit();
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  private phraseMatchScore(expected: string, spoken: string): number {
    const expWords = this.normalizeText(expected).split(' ');
    const spkWords = this.normalizeText(spoken).split(' ');
    const spkSet = new Set(spkWords);

    // Word presence score
    let matched = 0;
    for (const w of expWords) {
      if (spkSet.has(w)) matched++;
    }
    const presenceScore = matched / expWords.length;

    // Order score: check how many expected words appear in correct order
    let orderMatches = 0;
    let spkIdx = 0;
    for (const w of expWords) {
      const found = spkWords.indexOf(w, spkIdx);
      if (found !== -1) {
        orderMatches++;
        spkIdx = found + 1;
      }
    }
    const orderScore = orderMatches / expWords.length;

    // Combined: weight presence and order equally
    return (presenceScore * 0.5 + orderScore * 0.5);
  }

  private averageFingerprints(fingerprints: VoiceFingerprint[]): VoiceFingerprint {
    const n = fingerprints.length;
    if (n === 0) return { pitch: { min: 0, max: 0, avg: 0 }, tone: { brightness: 0, warmth: 0 }, speakingRate: 0, formants: [] };
    if (n === 1) return fingerprints[0];

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      pitch: {
        min: avg(fingerprints.map(f => f.pitch.min)),
        max: avg(fingerprints.map(f => f.pitch.max)),
        avg: avg(fingerprints.map(f => f.pitch.avg)),
      },
      tone: {
        brightness: avg(fingerprints.map(f => f.tone.brightness)),
        warmth: avg(fingerprints.map(f => f.tone.warmth)),
      },
      speakingRate: avg(fingerprints.map(f => f.speakingRate)),
      formants: (() => {
        const maxLen = Math.max(...fingerprints.map(f => f.formants.length));
        const result: number[] = [];
        for (let i = 0; i < maxLen; i++) {
          const vals = fingerprints.map(f => f.formants[i]).filter(v => v !== undefined);
          result.push(vals.length > 0 ? avg(vals) : 0);
        }
        return result;
      })(),
    };
  }
}
