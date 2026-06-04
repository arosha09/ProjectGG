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

  constructor(private http: HttpClient, private voiceAnalysis: ApexVoiceService) {}

  private createRecognition(): any {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: any) => {
      let full = '';
      for (let i = 0; i < event.results.length; i++) {
        full += event.results[i][0].transcript;
      }
      console.log('[ApexService] onresult:', JSON.stringify(full));
      this.updateState({ transcribedText: full });

      // check final for wake word
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript && this.state.voiceMode === 'wake-word') {
        if (finalTranscript.toLowerCase().includes('hey apex') && !this.state.wakeWordDetected) {
          this.updateState({ wakeWordDetected: true });
          this.wakeWordSubject.next();
          setTimeout(() => this.updateState({ wakeWordDetected: false }), 5000);
        }
      }
    };

    rec.onerror = (event: any) => {
      console.error('[ApexService] onerror:', event?.error);
    };

    rec.onstart = () => {
      console.log('[ApexService] recognition started');
    };

    rec.onend = () => {
      console.log('[ApexService] recognition ended');
      if (this.state.voiceMode === 'always-listening' && this.state.isListening) {
        this.startListening();
      }
    };

    return rec;
  }

  primeMicPermission(): void {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop());
        console.log('[Apex] Mic permission primed ✅');
      })
      .catch(err => {
        console.warn('[Apex] Mic permission denied:', err);
      });
  }

  startListening(): void {
    const callStack = new Error().stack;
    console.log('[Apex] === startListening() called ===');
    console.log('[Apex] Call stack:', callStack);
    console.log('[Apex] current state before stopListening:', JSON.stringify(this.state));

    this.stopListening();

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      console.error('[Apex] ❌ SpeechRecognition NOT available');
      return;
    }
    console.log('[Apex] ✅ SpeechRecognition available:', SR.name);

    this.updateState({ transcribedText: '' });

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.debug = true;

    rec.onstart = () => {
      console.log('[Apex] ★★★ onstart FIRED ★★★');
      this.updateState({ isListening: true });
    };

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      console.log('[Apex] ★ onresult — interim:', JSON.stringify(interim), '| final:', JSON.stringify(final), '| resLen:', event.results.length);
      this.updateState({ transcribedText: final || interim });

      if (final && this.state.voiceMode === 'wake-word') {
        if (final.toLowerCase().includes('hey apex') && !this.state.wakeWordDetected) {
          console.log('[Apex] wake word detected!');
          this.updateState({ wakeWordDetected: true });
          this.wakeWordSubject.next();
          setTimeout(() => this.updateState({ wakeWordDetected: false }), 5000);
        }
      }
    };

    rec.onerror = (event: any) => {
      console.error('[Apex] ★★★ onerror FIRED:', event?.error, '| message:', event?.message, '| state:', event?.state);
    };

    rec.onend = () => {
      console.log('[Apex] ★★★ onend FIRED ★★★');
      if (this.state.voiceMode === 'always-listening' && this.state.isListening) {
        console.log('[Apex] always-listening mode — restarting');
        this.startListening();
      }
    };

    rec.onaudiostart = () => console.log('[Apex] ★ onaudiostart');
    rec.onaudioend = () => console.log('[Apex] ★ onaudioend');
    rec.onspeechstart = () => console.log('[Apex] ★ onspeechstart');
    rec.onspeechend = () => console.log('[Apex] ★ onspeechend');
    rec.onsoundstart = () => console.log('[Apex] ★ onsoundstart');
    rec.onsoundend = () => console.log('[Apex] ★ onsoundend');

    this.recognition = rec;
    console.log('[Apex] recognition instance created, calling start() via setTimeout(0)...');

    setTimeout(() => {
      console.log('[Apex] setTimeout callback firing, attempting rec.start()');
      try {
        rec.start();
        console.log('[Apex] ✅ rec.start() succeeded — no exception thrown');
      } catch (e: any) {
        console.error('[Apex] ❌ rec.start() threw:', e?.message, e?.name);
      }
    }, 0);
  }

  stopListening(): void {
    if (this.recognition) {
      this.recognition.onend = null;
      try { this.recognition.stop(); } catch {}
      this.recognition = null;
    }
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

  askAi(message: string): Observable<{ response: string }> {
    return this.http.post<{ response: string }>('/api/ai/ask', { message });
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