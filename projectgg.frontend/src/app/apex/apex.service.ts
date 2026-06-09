import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { ApexVoiceService, VoiceFingerprint } from './apex-voice.service';
import html2canvas from 'html2canvas';

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
  private synthesis = window.speechSynthesis;

  private stateSubject = new Subject<ApexVoiceState>();
  public state$ = this.stateSubject.asObservable();
  private wakeWordSubject = new Subject<void>();
  public wakeWordDetected$ = this.wakeWordSubject.asObservable();
  private liveTranscriptSubject = new BehaviorSubject<string>('');
  public liveTranscript$ = this.liveTranscriptSubject.asObservable();

  private speakingSubject = new BehaviorSubject<boolean>(false);
  public speaking$ = this.speakingSubject.asObservable();

  private listeningSubject = new BehaviorSubject<boolean>(false);
  public listening$ = this.listeningSubject.asObservable();

  private thinkingSubject = new BehaviorSubject<boolean>(false);
  public thinking$ = this.thinkingSubject.asObservable();

  private transcriptionCompleteSubject = new Subject<string>();
  public transcriptionComplete$ = this.transcriptionCompleteSubject.asObservable();

  private state: ApexVoiceState = {
    isRecording: false,
    isListening: false,
    transcribedText: '',
    voiceOutputEnabled: true,
    selectedVoice: null,
    speechRate: 1.0,
    voiceMode: 'push-to-talk',
    wakeWordDetected: false,
  };

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private micStream: MediaStream | null = null;

  constructor(private http: HttpClient, private voiceAnalysis: ApexVoiceService) {}

setKokoroVoice(voice: string): void {
    try {
      localStorage.setItem('apex_kokoro_voice', voice);
    } catch {}
    this.state.selectedVoice = voice as any;
  }

  getKokoroVoice(): string | null {
    try {
      return localStorage.getItem('apex_kokoro_voice');
    } catch {
      return null;
    }
  }

  startListening(): void {
    this.updateState({ transcribedText: '', isListening: false });
    this.liveTranscriptSubject.next('');

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        this.micStream = stream;
        this.audioChunks = [];

        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm',
        });

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.start();
        this.updateState({ isListening: true });
        this.setListening(true);
      })
      .catch(err => {
        console.error('[Apex] getUserMedia failed:', err);
        this.updateState({ transcribedText: 'Mic access denied' });
      });
  }

  stopListening(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.micStream?.getTracks().forEach(t => t.stop());
        this.micStream = null;
        this.updateState({ isListening: false });
        this.setListening(false);

        if (blob.size < 1000) {
          console.warn('[Apex] Recording too short, skipping');
          this.updateState({ transcribedText: '' });
          this.liveTranscriptSubject.next('');
          return;
        }

        try {
          const base64 = await this.blobToBase64(blob);
          const res: any = await this.http
            .post('/api/ai/transcribe', { audio: base64 })
            .toPromise();
          const transcript = res?.transcript || '';
          console.log('[Apex] Whisper transcript:', transcript);
          this.updateState({ transcribedText: transcript });
          this.liveTranscriptSubject.next(transcript);
          if (transcript.trim()) {
            this.transcriptionCompleteSubject.next(transcript);
          }
        } catch (err) {
          console.error('[Apex] Transcription failed:', err);
          this.updateState({ transcribedText: '' });
          this.liveTranscriptSubject.next('');
        }
      };

      this.mediaRecorder.stop();
    } else {
      this.micStream?.getTracks().forEach(t => t.stop());
      this.micStream = null;
      this.updateState({ isListening: false });
      this.setListening(false);
    }
  }

  getTranscribedText(): string {
    return this.state.transcribedText;
  }

  clearTranscribedText(): void {
    this.updateState({ transcribedText: '' });
    this.liveTranscriptSubject.next('');
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

  // ─── Page Context ──────────────────────────────────────────────────────────

  getPageContext(): { url: string; title: string; description: string } {
    const meta = document.querySelector('meta[name="description"]');
    return {
      url: window.location.href,
      title: document.title,
      description: meta?.getAttribute('content') || '',
    };
  }

  async captureScreenshot(): Promise<string | null> {
    try {
      const apexPanel = document.querySelector('.apex-panel') as HTMLElement;
      const trigger = document.querySelector('.apex-trigger') as HTMLElement;

      if (apexPanel) apexPanel.style.display = 'none';
      if (trigger) trigger.style.display = 'none';

      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 0.5,
        logging: false,
      });

      if (apexPanel) apexPanel.style.display = '';
      if (trigger) trigger.style.display = '';

      return canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    } catch (err) {
      console.warn('[Apex] Screenshot capture failed:', err);
      return null;
    }
  }

  async capturePageContext(): Promise<{ pageContext: any; screenshot?: string }> {
    const pageContext = this.getPageContext();
    const screenshot = await this.captureScreenshot();
    return { pageContext, screenshot: screenshot || undefined };
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

  askAi(message: string, conversationHistory?: { role: 'user' | 'assistant'; content: string }[], includePageContext?: boolean): Observable<{ response: string }> {
    if (includePageContext) {
      return new Observable(subscriber => {
        this.capturePageContext().then(ctx => {
          this.http.post<{ response: string }>('/api/ai/ask', {
            message,
            conversationHistory,
            pageContext: ctx.pageContext,
            screenshot: ctx.screenshot,
          }).subscribe({
            next: res => subscriber.next(res),
            error: err => subscriber.error(err),
          });
        });
      });
    }
    return this.http.post<{ response: string }>('/api/ai/ask', {
      message,
      conversationHistory,
    });
  }

  getUserConversations(limit: number = 20, offset: number = 0): Observable<any[]> {
    return this.http.get<any[]>(`/api/apex/conversations?limit=${limit}&offset=${offset}`);
  }

  getConversationMessages(conversationId: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/apex/conversations/${conversationId}/messages`);
  }

  speak(text: string): Promise<void> {
    if (!this.state.voiceOutputEnabled) return Promise.resolve();

    this.synthesis.cancel();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.state.speechRate;

      if (this.state.selectedVoice && typeof this.state.selectedVoice !== 'string') {
        utterance.voice = this.state.selectedVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      this.synthesis.speak(utterance);
    });
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

  setSpeaking(val: boolean): void {
    this.speakingSubject.next(val);
  }

  setListening(val: boolean): void {
    this.listeningSubject.next(val);
  }

  setThinking(val: boolean): void {
    this.thinkingSubject.next(val);
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
