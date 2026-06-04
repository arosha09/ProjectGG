import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { ApexVoiceService, VoiceFingerprint } from './apex-voice.service';

export interface ApexVoiceState {
  isRecording: boolean;
  isListening: boolean;
  transcribedText: string;
  voiceOutputEnabled: boolean;
  selectedVoice: SpeechSynthesisVoice | null;
  speechRate: number;
  voiceMode: 'push-to-talk' | 'always-listening' | 'wake-word';
  wakeWordDetected: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApexService {
  private recognition: any = null;
  private synthesis = window.speechSynthesis;

  private stateSubject = new Subject<ApexVoiceState>();
  public state$ = this.stateSubject.asObservable();
  private wakeWordSubject = new Subject<void>();
  public wakeWordDetected$ = this.wakeWordSubject.asObservable();
  private state: ApexVoiceState = {
    isRecording: false,
    isListening: false,
    transcribedText: '',
    voiceOutputEnabled: false,
    selectedVoice: null,
    speechRate: 1.0,
    voiceMode: 'push-to-talk',
    wakeWordDetected: false,
  };

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private wakeWordRecognition: any = null;

  constructor(private http: HttpClient, private voiceAnalysis: ApexVoiceService) {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const text = finalTranscript || interimTranscript;
      this.updateState({ transcribedText: text });

      if (finalTranscript && this.state.voiceMode === 'wake-word') {
        if (finalTranscript.toLowerCase().includes('hey apex') && !this.state.wakeWordDetected) {
          this.updateState({ wakeWordDetected: true });
          this.wakeWordSubject.next();
          setTimeout(() => this.updateState({ wakeWordDetected: false }), 5000);
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.updateState({ isListening: false });
    };

    this.recognition.onend = () => {
      if (this.state.voiceMode === 'always-listening' && this.state.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          console.error('Failed to restart recognition:', e);
        }
      }
    };
  }

  startListening(): void {
    if (!this.recognition) return;
    try {
      this.recognition.start();
      this.updateState({ isListening: true });
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }

  stopListening(): void {
    if (!this.recognition) return;
    this.recognition.stop();
    this.updateState({ isListening: false });
  }

  getTranscribedText(): string {
    return this.state.transcribedText;
  }

  clearTranscribedText(): void {
    this.updateState({ transcribedText: '' });
  }

  startRecording(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
          stream.getTracks().forEach(track => track.stop());
          resolve(blob);
        };

        this.mediaRecorder.start();
        this.updateState({ isRecording: true });

        setTimeout(() => {
          if (this.mediaRecorder?.state === 'recording') {
            this.stopRecording().then(resolve);
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (this.mediaRecorder?.state === 'recording') {
        this.mediaRecorder.stop();
        this.updateState({ isRecording: false });
        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
          resolve(blob);
        };
      } else {
        resolve(new Blob());
      }
    });
  }

  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async uploadVoiceRecording(audio: Blob, index: number, fingerprint?: VoiceFingerprint): Promise<any> {
    const base64 = await this.blobToBase64(audio);
    return this.http.post('/api/ai/voice/upload', { audio: base64, index, fingerprint }).toPromise();
  }

  getVoiceProfile(): Observable<any> {
    return this.http.get('/api/ai/voice/profile');
  }

  addVocabulary(words: string[]): Observable<any> {
    return this.http.post('/api/ai/voice/vocabulary', { words });
  }

  deleteVoiceProfile(): Observable<any> {
    return this.http.delete('/api/ai/voice/profile');
  }

  speak(text: string): void {
    if (!this.state.voiceOutputEnabled) return;

    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.state.speechRate;

    if (this.state.selectedVoice) {
      utterance.voice = this.state.selectedVoice;
    }

    this.synthesis.speak(utterance);
  }

  stopSpeaking(): void {
    this.synthesis.cancel();
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices();
  }

  loadVoices(): void {
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = () => {
        const voices = this.getAvailableVoices();
        if (voices.length > 0 && !this.state.selectedVoice) {
          const englishVoices = voices.filter(v => v.lang.startsWith('en'));
          this.updateState({ selectedVoice: englishVoices[0] || voices[0] });
        }
      };
    }
    this.getAvailableVoices();
  }

  setVoiceOutputEnabled(enabled: boolean): void {
    this.updateState({ voiceOutputEnabled: enabled });
    if (!enabled) {
      this.stopSpeaking();
    }
  }

  setVoiceMode(mode: 'push-to-talk' | 'always-listening' | 'wake-word'): void {
    this.stopListening();
    this.updateState({ voiceMode: mode });
  }

  setSpeechRate(rate: number): void {
    this.updateState({ speechRate: rate });
  }

  setSelectedVoice(voice: SpeechSynthesisVoice): void {
    this.updateState({ selectedVoice: voice });
  }

  isSpeechRecognitionSupported(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  isSpeechSynthesisSupported(): boolean {
    return !!window.speechSynthesis;
  }

  private updateState(partial: Partial<ApexVoiceState>): void {
    this.state = { ...this.state, ...partial };
    this.stateSubject.next(this.state);
  }

  getState(): ApexVoiceState {
    return { ...this.state };
  }
}