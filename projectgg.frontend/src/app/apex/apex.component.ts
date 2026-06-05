import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostBinding, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ApexService } from './apex.service';
import { VoiceTrainingComponent } from './voice-training/voice-training.component';
import { Subscription } from 'rxjs';

interface ChatMessage {
  user_id: string;
  content: string;
  imageUrl?: string;
  timestamp?: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  isPinned: boolean;
  createdAt: number;
  lastActive: number;
}

@Component({
  selector: 'app-apex-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatInputModule, MatFormFieldModule, VoiceTrainingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apex.component.html',
  styleUrls: ['./apex.component.scss'],
})
export class ApexChatComponent implements OnInit, OnDestroy {
  @HostBinding('class.loaded') isLoaded = false;
  @ViewChild('chatInput') chatInputRef?: ElementRef<HTMLInputElement>;

  isPanelOpen = false;
  isExpandedManually = false;

  isRecording = false;
  isListening = false;
  transcribedText = '';
  liveTranscript = '';
  voiceOutputEnabled = true;
  pageContextEnabled = true;
  voiceMode: 'push-to-talk' | 'always-listening' | 'wake-word' = 'push-to-talk';
  selectedVoice: SpeechSynthesisVoice | null = null;
  speechRate = 1.0;
  availableVoices: SpeechSynthesisVoice[] = [];

  showTraining = false;
  showSettings = false;
  isSupported = true;
  pendingAiQuery = false;
  chatMessage = '';
  currentUserId: string = 'mock-user-id';
  conversationStarted = false;

  sessions: ChatSession[] = [];
  activeSessionId: string | null = null;
  maxSessionsPerDay = 5;
  maxPinnedPerUser = 2;
  showSessionList = false;

  suggestions: string[] = [];
  selectedImage: File | null = null;
  imagePreview: string | null = null;

  private stateSub?: Subscription;
  private wakeWordSub?: Subscription;
  private liveTranscriptSub?: Subscription;

  constructor(
    private apexService: ApexService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {}

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isPanelOpen) {
      this.isPanelOpen = false;
      this.isExpandedManually = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isPanelOpen) return;
    const target = event.target as HTMLElement;
    if (!this.elRef.nativeElement.contains(target)) {
      this.isPanelOpen = false;
      this.isExpandedManually = false;
      this.cdr.markForCheck();
    }
  }

  ngOnInit(): void {
    this.apexService.loadVoices();
    this.loadSessions();
    this.generateDailySuggestions();
    this.cleanupOldSessions();

    setTimeout(() => {
      this.isLoaded = true;
      this.cdr.markForCheck();
    }, 1000);

    this.stateSub = this.apexService.state$.subscribe(state => {
      const wasListening = this.isListening;
      this.isRecording = state.isRecording;
      this.isListening = state.isListening;
      this.transcribedText = state.transcribedText;
      this.voiceOutputEnabled = state.voiceOutputEnabled;
      this.voiceMode = state.voiceMode;
      this.selectedVoice = state.selectedVoice;
      this.speechRate = state.speechRate;
      this.availableVoices = this.apexService.getAvailableVoices();

      if (wasListening && !state.isListening && state.transcribedText) {
        this.handleTranscriptionComplete(state.transcribedText);
      }

      this.cdr.markForCheck();
    });

    this.liveTranscriptSub = this.apexService.liveTranscript$.subscribe(text => {
      this.liveTranscript = text;
      this.chatMessage = text;
      this.cdr.markForCheck();
    });

    this.wakeWordSub = this.apexService.wakeWordDetected$.subscribe(() => {
      if (this.voiceMode === 'wake-word') {
        this.apexService.getVoiceProfile().subscribe({
          next: (response: any) => {
            const trained = response?.status?.completed;
            if (!trained) {
              this.isPanelOpen = true;
              this.showSettings = false;
              this.cdr.markForCheck();
            }
          },
          error: () => {},
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.wakeWordSub?.unsubscribe();
    this.liveTranscriptSub?.unsubscribe();
    this.apexService.stopListening();
  }

  get activeSession(): ChatSession | undefined {
    return this.sessions.find(s => s.id === this.activeSessionId);
  }

  get messages(): ChatMessage[] {
    return this.activeSession?.messages ?? [];
  }

  togglePanel(): void {
    this.isPanelOpen = !this.isPanelOpen;
    if (!this.isPanelOpen) {
      this.isExpandedManually = false;
    }
    this.cdr.markForCheck();
  }

  toggleExpand(): void {
    this.isExpandedManually = !this.isExpandedManually;
    this.cdr.markForCheck();
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
    this.cdr.markForCheck();
  }

  toggleSessionList(): void {
    this.showSessionList = !this.showSessionList;
    this.cdr.markForCheck();
  }

  // ─── Session Management ──────────────────────────────────────────────────────

  private loadSessions(): void {
    try {
      const raw = localStorage.getItem('apex_sessions');
      if (raw) {
        this.sessions = JSON.parse(raw);
      }
    } catch { this.sessions = []; }

    const todaySessions = this.getTodaySessions();
    if (todaySessions.length > 0 && !this.activeSessionId) {
      this.activeSessionId = todaySessions[todaySessions.length - 1].id;
    }
  }

  private saveSessions(): void {
    try {
      localStorage.setItem('apex_sessions', JSON.stringify(this.sessions));
    } catch { /* quota exceeded — silently fail */ }
  }

  getTodaySessions(): ChatSession[] {
    const todayStart = this.getTodayStart();
    return this.sessions.filter(s => s.createdAt >= todayStart);
  }

  private getTodayStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  private cleanupOldSessions(): void {
    const todayStart = this.getTodayStart();
    this.sessions = this.sessions.filter(s => s.isPinned || s.createdAt >= todayStart);
    this.saveSessions();
  }

  canCreateSession(): boolean {
    return this.getTodaySessions().length < this.maxSessionsPerDay;
  }

  getPinnedCount(): number {
    return this.sessions.filter(s => s.isPinned).length;
  }

  createNewSession(): void {
    if (!this.canCreateSession()) return;

    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      isPinned: false,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };

    this.sessions.push(session);
    this.activeSessionId = session.id;
    this.conversationStarted = false;
    this.showSessionList = false;
    this.saveSessions();
    this.cdr.markForCheck();
  }

  selectSession(id: string): void {
    this.activeSessionId = id;
    this.showSessionList = false;
    this.conversationStarted = this.messages.length > 0;
    this.cdr.markForCheck();
  }

  deleteSession(id: string, event: Event): void {
    event.stopPropagation();
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.activeSessionId === id) {
      const todaySessions = this.getTodaySessions();
      this.activeSessionId = todaySessions.length > 0 ? todaySessions[todaySessions.length - 1].id : null;
    }
    this.saveSessions();
    this.cdr.markForCheck();
  }

  togglePinSession(id: string, event: Event): void {
    event.stopPropagation();
    const session = this.sessions.find(s => s.id === id);
    if (!session) return;

    if (session.isPinned) {
      session.isPinned = false;
    } else {
      if (this.getPinnedCount() >= this.maxPinnedPerUser) return;
      session.isPinned = true;
    }
    this.saveSessions();
    this.cdr.markForCheck();
  }

  private autoTitle(session: ChatSession): void {
    if (session.title !== 'New Chat') return;
    const firstUserMsg = session.messages.find(m => m.user_id === this.currentUserId);
    if (firstUserMsg) {
      session.title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
    }
  }

  // ─── Suggestions ─────────────────────────────────────────────────────────────

  private generateDailySuggestions(): void {
    const seed = this.getTodayStart();
    const pools: string[][] = [
      [
        'What specs do I need for 144fps gaming?',
        'Best budget GPU for 1080p in 2026?',
        'How to reduce input lag on PC?',
        'Is 32GB RAM overkill for gaming?',
        'Best monitor for competitive gaming?',
        'How to optimize Windows for gaming?',
      ],
      [
        'What\'s the meta in Valorant right now?',
        'Best card trading strategies?',
        'Tips for climbing ranked in LoL?',
        'Which roguelike should I play next?',
        'Best co-op games to play with friends?',
        'How to improve aim in FPS games?',
      ],
      [
        'What\'s new in gaming tech this week?',
        'Are RTX 5000 cards worth it?',
        'Best gaming headset under $100?',
        'Steam Deck vs handheld PC comparison?',
        'Should I upgrade to DDR5 RAM?',
        'Best mechanical keyboard for gaming?',
      ],
    ];

    const hash = Math.floor(seed / 86400000);
    const idx1 = hash % pools[0].length;
    const idx2 = (hash + 2) % pools[1].length;
    const idx3 = (hash + 4) % pools[2].length;

    this.suggestions = [pools[0][idx1], pools[1][idx2], pools[2][idx3]];
  }

  useSuggestion(suggestion: string): void {
    this.chatMessage = suggestion;
    this.sendMessage();
  }

  // ─── Chat ────────────────────────────────────────────────────────────────────

  sendMessage(): void {
    if (!this.chatMessage.trim() && !this.selectedImage) return;
    if (!this.activeSessionId) {
      this.createNewSession();
    }

    const session = this.activeSession!;
    let userMsg: ChatMessage = {
      user_id: this.currentUserId,
      content: this.chatMessage,
      timestamp: Date.now(),
    };

    if (this.selectedImage && this.imagePreview) {
      userMsg.imageUrl = this.imagePreview;
    }

    session.messages = [...session.messages, userMsg];
    session.lastActive = Date.now();
    this.conversationStarted = true;
    this.autoTitle(session);

    const userText = this.chatMessage;
    this.chatMessage = '';
    this.liveTranscript = '';
    this.selectedImage = null;
    this.imagePreview = null;
    this.pendingAiQuery = true;
    this.saveSessions();
    this.cdr.markForCheck();

    const history = session.messages
      .filter(m => !m.imageUrl)
      .map(m => ({
        role: m.user_id === this.currentUserId ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    this.apexService.askAi(userText, history, this.pageContextEnabled).subscribe({
      next: (res) => {
        session.messages = [...session.messages, {
          user_id: 'apex',
          content: res.response,
          timestamp: Date.now(),
        }];
        session.lastActive = Date.now();
        this.pendingAiQuery = false;
        this.apexService.speak(res.response);
        this.saveSessions();
        this.cdr.markForCheck();
      },
      error: () => {
        session.messages = [...session.messages, {
          user_id: 'apex',
          content: 'Failed to get response. Try again.',
          timestamp: Date.now(),
        }];
        this.pendingAiQuery = false;
        this.saveSessions();
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Image ───────────────────────────────────────────────────────────────────

  onImageSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;

    this.selectedImage = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview = reader.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  removeImage(): void {
    this.selectedImage = null;
    this.imagePreview = null;
    this.cdr.markForCheck();
  }

  // ─── Mic Toggle ──────────────────────────────────────────────────────────────

  toggleMic(): void {
    if (this.isListening) {
      this.apexService.stopListening();
    } else {
      this.liveTranscript = '';
      this.chatMessage = '';
      this.apexService.startListening();
    }
  }

  private handleTranscriptionComplete(text: string): void {
    if (!text.trim()) {
      this.pendingAiQuery = false;
      this.cdr.markForCheck();
      return;
    }

    if (!this.activeSessionId) {
      this.createNewSession();
    }

    const session = this.activeSession!;
    session.messages = [...session.messages, {
      user_id: this.currentUserId,
      content: text,
      timestamp: Date.now(),
    }];
    session.lastActive = Date.now();
    this.conversationStarted = true;
    this.autoTitle(session);
    this.chatMessage = '';
    this.liveTranscript = '';
    this.saveSessions();
    this.cdr.markForCheck();

    const history = session.messages.map(m => ({
      role: m.user_id === this.currentUserId ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    this.apexService.askAi(text, history, this.pageContextEnabled).subscribe({
      next: (res) => {
        session.messages = [...session.messages, {
          user_id: 'apex',
          content: res.response,
          timestamp: Date.now(),
        }];
        session.lastActive = Date.now();
        this.pendingAiQuery = false;
        this.apexService.speak(res.response);
        this.saveSessions();
        this.cdr.markForCheck();
      },
      error: () => {
        session.messages = [...session.messages, {
          user_id: 'apex',
          content: 'Failed to get response. Try again.',
          timestamp: Date.now(),
        }];
        this.pendingAiQuery = false;
        this.saveSessions();
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Voice ───────────────────────────────────────────────────────────────────

  toggleVoiceOutput(): void {
    this.apexService.setVoiceOutputEnabled(!this.voiceOutputEnabled);
  }

  setVoiceMode(mode: 'push-to-talk' | 'always-listening' | 'wake-word'): void {
    if (mode === 'push-to-talk') {
      this.apexService.setVoiceMode(mode);
      return;
    }
    this.apexService.getVoiceProfile().subscribe({
      next: (response: any) => {
        const count = response?.status?.count ?? 0;
        if (count >= 5) {
          this.apexService.setVoiceMode(mode);
        } else {
          this.showSettings = true;
          this.openTraining();
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.showSettings = true;
        this.openTraining();
        this.cdr.markForCheck();
      },
    });
  }

  setSpeechRate(rate: number): void {
    this.apexService.setSpeechRate(rate);
  }

  selectVoice(voice: SpeechSynthesisVoice): void {
    this.apexService.setSelectedVoice(voice);
  }

  isSpeechSynthesisSupported(): boolean {
    return this.apexService.isSpeechSynthesisSupported();
  }

  openTraining(): void {
    this.showTraining = true;
    this.isPanelOpen = false;
    this.isExpandedManually = false;
  }

  closeTraining(): void {
    this.showTraining = false;
  }
}
