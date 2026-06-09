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
    'This is my voice training APEX to recognize me better.',
    'The quick brown fox jumps over the lazy dog near the riverbank.',
    'I love playing card games and trading rare items with friends.',
    'APEX what is the rarest card in the entire collection right now?',
    'Hey APEX tell me a funny gaming joke to brighten my day.',
  ];

  currentStep = 0;
  isRecording = false;
  trainingComplete = false;
  progress = 0;
  statusMessage = '';
  mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  private pendingBlob: Blob | null = null;
  private pendingFingerprint: VoiceFingerprint | null = null;
  previewUrl: string | null = null;
  recognizedText = '';
  private recognition: any = null;

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
    if (this.isRecording || this.isPreview) return;

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
        this.stopRecognition();
        await this.processRecording();
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.statusMessage = 'Recording... Read the phrase above.';
      this.cdr.markForCheck();

      this.startRecognition();

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

    if (this.recognizedText) {
      const score = this.phraseMatchScore(this.currentPhrase, this.recognizedText);
      if (score < 0.5) {
        this.statusMessage = `Couldn't understand clearly. You said: "${this.recognizedText}". Please try again.`;
        this.discardPending();
        this.recognizedText = '';
        this.cdr.markForCheck();
        return;
      }
    }

    try {
      this.statusMessage = 'Analyzing your voice...';
      this.cdr.markForCheck();

      this.pendingFingerprint = await this.voiceService.extractFingerprint(blob);
      this.pendingBlob = blob;
      this.previewUrl = URL.createObjectURL(blob);
      this.statusMessage = 'Press play to review your recording.';
      this.cdr.markForCheck();

      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
    } catch (error) {
      this.statusMessage = 'Failed to analyze recording. Please try again.';
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

      await this.http.post('/api/ai/voice/upload', {
        audio: base64,
        index: this.currentStep,
        fingerprint,
      }).toPromise();

      this.progress = this.currentStep + 1;
      this.statusMessage = `Recording ${this.progress}/10 saved.`;
      this.cdr.markForCheck();

      if (this.currentStep < 4) {
        setTimeout(() => {
          this.currentStep++;
          this.statusMessage = '';
          this.cdr.markForCheck();
        }, 1500);
      } else {
        this.trainingComplete = true;
        this.statusMessage = 'Voice training complete! APEX now recognizes your voice.';
        this.cdr.markForCheck();
      }
    } catch (error) {
      this.statusMessage = 'Failed to upload. Please try again.';
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
      this.statusMessage = 'Failed to delete profile.';
      this.cdr.markForCheck();
    }
  }

  onClose(): void {
    this.discardPending();
    this.stopRecognition();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.close.emit();
  }

  private startRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    this.recognition.onresult = (event: any) => {
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        }
      }
      if (final) {
        this.recognizedText = final;
        this.cdr.markForCheck();
      }
    };

    this.recognition.onerror = () => {};
    this.recognition.onend = () => {};

    try {
      this.recognition.start();
    } catch {}
  }

  private stopRecognition(): void {
    if (this.recognition) {
      try { this.recognition.stop(); } catch {}
      this.recognition = null;
    }
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  private phraseMatchScore(expected: string, spoken: string): number {
    const expWords = this.normalizeText(expected).split(' ');
    const spkWords = new Set(this.normalizeText(spoken).split(' '));
    let matched = 0;
    for (const w of expWords) {
      if (spkWords.has(w)) matched++;
    }
    return matched / expWords.length;
  }
}