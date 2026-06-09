import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostBinding, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ApexService } from './apex.service';
import { KokoroTtsService } from './kokoro-tts.service';
import { TtsSettingsService } from '../services/tts-settings.service';
import { VoiceTrainingComponent } from './voice-training/voice-training.component';
import { ApexAvatarComponent } from './apex-avatar/apex-avatar.component';
import { CyberSelectComponent, CyberSelectOption } from '../components/cyber-select/cyber-select.component';
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
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatInputModule, MatFormFieldModule, VoiceTrainingComponent, ApexAvatarComponent, CyberSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apex.component.html',
  styleUrls: ['./apex.component.scss'],
})
export class ApexChatComponent implements OnInit, OnDestroy {
  @HostBinding('class.loaded') isLoaded = false;
  @ViewChild('chatInput') chatInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('chatBody') chatBodyRef?: ElementRef<HTMLDivElement>;

  isPanelOpen = false;
  isExpandedManually = false;

  isRecording = false;
  isListening = false;
  transcribedText = '';
  liveTranscript = '';
  voiceOutputEnabled = true;
  pageContextEnabled = false;
  voiceMode: 'push-to-talk' | 'always-listening' | 'wake-word' = 'push-to-talk';
  selectedVoice: SpeechSynthesisVoice | null = null;
  speechRate = 1.0;
  availableVoices: SpeechSynthesisVoice[] = [];

  showTraining = false;
  showSettings = false;
  showHelp = false;
  showSearch = false;
  showScrollBtn = false;

  get showFloatingAvatar(): boolean {
    return this._showFloatingAvatar;
  }

  set showFloatingAvatar(value: boolean) {
    this._showFloatingAvatar = value;
    try { localStorage.setItem('apex_floating_avatar', JSON.stringify(value)); } catch {}
    this.cdr.markForCheck();
  }

  private _showFloatingAvatar = true;
  isSupported = true;
  avatarAnimating = false;
  pendingAiQuery = false;
  ttsLoading = false;
  isSpeaking = false;
  sendingVoice = false;
  private currentAudio: HTMLAudioElement | null = null;
  isTranscribing = false;
  chatMessage = '';
  currentUserId: string = 'mock-user-id';
  conversationStarted = false;
  searchQuery = '';
  searchResults: number[] = [];
  currentSearchIndex = -1;
  kokoroVoice = '';
  kokoroVoiceOptions: CyberSelectOption[] = [];
  highlightSetting = '';

  sessions: ChatSession[] = [];
  activeSessionId: string | null = null;
  maxSessionsPerDay = 5;
  maxPinnedPerUser = 2;
  showSessionList = false;

  suggestions: string[] = [];
  selectedImage: File | null = null;
  imagePreview: string | null = null;

  showAtMenu = false;
  atQuery = '';
  private readonly atCommands = [
    { name: '@ProjectGG', description: 'Ask about your page or codebase' },
  ];

  private stateSub?: Subscription;
  private wakeWordSub?: Subscription;
  private liveTranscriptSub?: Subscription;
  private voicesSub?: Subscription;
  private selectedVoiceSub?: Subscription;
  private speakingSub?: Subscription;
  private transcriptionCompleteSub?: Subscription;

  constructor(
    private apexService: ApexService,
    private kokoroTtsService: KokoroTtsService,
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
    this.kokoroTtsService.preload();
    this.loadSessions();
    this.generateDailySuggestions();
    this.cleanupOldSessions();

    try {
      const saved = localStorage.getItem('apex_floating_avatar');
      if (saved !== null) this._showFloatingAvatar = JSON.parse(saved);
    } catch {}

    this.voicesSub = this.kokoroTtsService.voices$.subscribe(options => {
      this.kokoroVoiceOptions = options;
      this.cdr.markForCheck();
    });

    this.selectedVoiceSub = this.kokoroTtsService.getSelectedVoiceObservable().subscribe(voiceId => {
      this.kokoroVoice = voiceId;
      this.apexService.setKokoroVoice(voiceId);
      this.cdr.markForCheck();
    });

    setTimeout(() => {
      this.isLoaded = true;
      this.cdr.markForCheck();
    }, 1000);

    this.stateSub = this.apexService.state$.subscribe(state => {
      this.isRecording = state.isRecording;
      this.isListening = state.isListening;
      this.transcribedText = state.transcribedText;
      this.voiceOutputEnabled = state.voiceOutputEnabled;
      this.voiceMode = state.voiceMode;
      this.selectedVoice = state.selectedVoice;
      this.speechRate = state.speechRate;
      this.availableVoices = this.apexService.getAvailableVoices();
      this.cdr.markForCheck();
    });

    this.transcriptionCompleteSub = this.apexService.transcriptionComplete$.subscribe(text => {
      this.handleTranscriptionComplete(text);
    });

    this.liveTranscriptSub = this.apexService.liveTranscript$.subscribe(text => {
      this.liveTranscript = text;
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

    this.speakingSub = this.apexService.speaking$.subscribe(v => {
      this.isSpeaking = v;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.wakeWordSub?.unsubscribe();
    this.liveTranscriptSub?.unsubscribe();
    this.voicesSub?.unsubscribe();
    this.selectedVoiceSub?.unsubscribe();
    this.speakingSub?.unsubscribe();
    this.transcriptionCompleteSub?.unsubscribe();
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
    } else {
      setTimeout(() => this.scrollToBottom(), 0);
    }
    this.cdr.markForCheck();
  }

  toggleExpand(): void {
    this.isExpandedManually = !this.isExpandedManually;
    this.cdr.markForCheck();
  }

  toggleSettings(): void {
    if (this.showSettings) {
      this.showSettings = false;
    } else {
      this.showSettings = true;
      this.showSessionList = false;
      this.showHelp = false;
    }
    this.cdr.markForCheck();
  }

  toggleSessionList(): void {
    if (this.showSessionList) {
      this.showSessionList = false;
    } else {
      this.showSessionList = true;
      this.showSettings = false;
      this.showHelp = false;
    }
    this.cdr.markForCheck();
  }

  toggleHelp(): void {
    if (this.showHelp) {
      this.showHelp = false;
    } else {
      this.showHelp = true;
      this.showSettings = false;
      this.showSessionList = false;
    }
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

  onEnterKey(event: Event): void {
    event.preventDefault();
    if (this.showAtMenu && this.filteredAtCommands.length > 0) {
      this.insertAtCommand(this.filteredAtCommands[0].name);
      return;
    }
    this.sendMessage();
  }

  get filteredAtCommands(): { name: string; description: string }[] {
    return this.atCommands.filter(c => c.name.toLowerCase().includes(this.atQuery.toLowerCase()));
  }

  onAtInput(): void {
    const val = this.chatMessage;
    const atIndex = val.lastIndexOf('@');
    if (atIndex >= 0 && (atIndex === 0 || val[atIndex - 1] === ' ' || val[atIndex - 1] === '\n')) {
      this.atQuery = val.slice(atIndex);
      this.showAtMenu = true;
    } else {
      this.showAtMenu = false;
    }
  }

  insertAtCommand(name: string): void {
    const val = this.chatMessage;
    const atIndex = val.lastIndexOf('@');
    if (atIndex >= 0) {
      this.chatMessage = val.slice(0, atIndex) + name + ' ';
    }
    this.showAtMenu = false;
    this.chatInputRef?.nativeElement.focus();
    this.cdr.markForCheck();
  }

  closeAtMenu(): void {
    this.showAtMenu = false;
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
    this.apexService.setThinking(true);
    this.checkAtBottom();
    this.saveSessions();
    this.cdr.markForCheck();
    setTimeout(() => this.scrollToBottom(), 50);

    const history = session.messages
      .filter(m => !m.imageUrl)
      .map(m => ({
        role: m.user_id === this.currentUserId ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    this.apexService.askAi(userText, history, this.pageContextEnabled).subscribe({
      next: (res) => {
        session.lastActive = Date.now();
        this.apexService.setThinking(false);
        this.speakWithKokoro(res.response, () => {
          session.messages = [...session.messages, {
            user_id: 'apex',
            content: res.response,
            timestamp: Date.now(),
          }];
          this.pendingAiQuery = false;
          this.saveSessions();
          this.scrollIfNeeded();
          this.cdr.markForCheck();
        });
      },
      error: () => {
        session.messages = [...session.messages, {
          user_id: 'apex',
          content: 'Failed to get response. Try again.',
          timestamp: Date.now(),
        }];
        this.pendingAiQuery = false;
        this.apexService.setThinking(false);
        this.saveSessions();
        this.scrollIfNeeded();
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
      this.sendingVoice = false;
      this.liveTranscript = '';
      this.chatMessage = '';
      this.apexService.startListening();
    }
  }

  onSilenceDetected(): void {
    if (this.isListening) {
      this.apexService.stopListening();
    }
  }

  private handleTranscriptionComplete(text: string): void {
    if (!text.trim()) {
      this.pendingAiQuery = false;
      this.cdr.markForCheck();
      return;
    }

    if (this.sendingVoice) return;
    this.sendingVoice = true;

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
    this.checkAtBottom();
    this.saveSessions();
    this.cdr.markForCheck();

    const history = session.messages.map(m => ({
      role: m.user_id === this.currentUserId ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    this.pendingAiQuery = true;
    this.apexService.setThinking(true);
    this.cdr.markForCheck();

    this.apexService.askAi(text, history, false).subscribe({
      next: (res) => {
        this.sendingVoice = false;
        session.lastActive = Date.now();
        this.apexService.setThinking(false);
        this.speakWithKokoro(res.response, () => {
          session.messages = [...session.messages, {
            user_id: 'apex',
            content: res.response,
            timestamp: Date.now(),
          }];
          this.pendingAiQuery = false;
          this.saveSessions();
          this.scrollIfNeeded();
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.sendingVoice = false;
        session.messages = [...session.messages, {
          user_id: 'apex',
          content: 'Failed to get response. Try again.',
          timestamp: Date.now(),
        }];
        this.pendingAiQuery = false;
        this.apexService.setThinking(false);
        this.saveSessions();
        this.scrollIfNeeded();
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

  selectKokoroVoice(voice: string): void {
    this.kokoroTtsService.setSelectedVoice(voice);
    this.kokoroTtsService.saveUserVoice(voice).subscribe({
      next: (res) => {
        if (res.success && res.selected_voice !== voice) {
          this.kokoroTtsService.setSelectedVoice(res.selected_voice);
        }
      },
      error: () => {},
    });
  }

  private speakWithKokoro(text: string, onReady?: () => void): void {
    if (!this.voiceOutputEnabled) {
      onReady?.();
      return;
    }

    const cleanText = this.stripEmojis(text);
    const voiceId = this.kokoroVoice || this.kokoroTtsService.getSelectedVoice() || 'en-US-GuyNeural';

    this.ttsLoading = true;
    this.cdr.markForCheck();

    this.kokoroTtsService.synthesize(cleanText, voiceId).then((url) => {
      this.ttsLoading = false;
      if (url) {
        onReady?.();
        const audio = new Audio(url);
        this.currentAudio = audio;
        this.apexService.setSpeaking(true);
        audio.onended = () => {
          this.currentAudio = null;
          this.apexService.setSpeaking(false);
          this.kokoroTtsService.revokeUrl(url);
          this.cdr.markForCheck();
        };
        audio.onerror = (err) => {
          this.currentAudio = null;
          this.apexService.setSpeaking(false);
          console.warn('[Apex] Audio playback error:', err);
          this.kokoroTtsService.revokeUrl(url);
          this.cdr.markForCheck();
        };
        audio.play().catch(err => {
          this.currentAudio = null;
          this.apexService.setSpeaking(false);
          console.warn('[Apex] Audio play failed:', err);
          this.cdr.markForCheck();
        });
      } else {
        onReady?.();
      }
      this.cdr.markForCheck();
    }).catch(err => {
      this.ttsLoading = false;
      onReady?.();
      this.cdr.markForCheck();
      console.warn('[Apex] Kokoro TTS failed:', err);
    });
  }

  cancelResponse(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.apexService.setSpeaking(false);
    this.ttsLoading = false;
    this.pendingAiQuery = false;
    this.apexService.setThinking(false);
    this.cdr.markForCheck();
  }

  private stripEmojis(text: string): string {
    return text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  }

  scrollToBottom(): void {
    this.showScrollBtn = false;
    this.cdr.markForCheck();
    setTimeout(() => {
      const el = this.chatBodyRef?.nativeElement;
      if (!el) return;
      const start = el.scrollTop;
      const end = el.scrollHeight - el.clientHeight;
      const distance = end - start;
      if (distance <= 0) return;
      const duration = Math.min(600, Math.max(200, distance * 0.5));
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        el.scrollTop = start + distance * ease;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  toggleSearch(): void {
    this.showSearch = !this.showSearch;
  }

  onSearchInput(): void {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.searchResults = [];
      this.currentSearchIndex = -1;
      return;
    }
    this.searchResults = this.messages
      .map((msg, i) => msg.content.toLowerCase().includes(q) ? i : -1)
      .filter(i => i !== -1);
    this.currentSearchIndex = this.searchResults.length > 0 ? 0 : -1;
    if (this.currentSearchIndex >= 0) this.scrollToMessage(this.searchResults[this.currentSearchIndex]);
  }

  navigateSearch(direction: number): void {
    if (this.searchResults.length === 0) return;
    this.currentSearchIndex = (this.currentSearchIndex + direction + this.searchResults.length) % this.searchResults.length;
    this.scrollToMessage(this.searchResults[this.currentSearchIndex]);
  }

  private scrollToMessage(index: number): void {
    setTimeout(() => {
      const container = this.chatBodyRef?.nativeElement;
      if (!container) return;
      const msgs = container.querySelectorAll('.apex-msg-wrapper');
      if (msgs[index]) {
        msgs[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }

  onChatScroll(): void {
    const el = this.chatBodyRef?.nativeElement;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    this.showScrollBtn = !atBottom;
    this.cdr.markForCheck();
  }

  private wasAtBottom = false;

  private checkAtBottom(): void {
    const el = this.chatBodyRef?.nativeElement;
    if (!el) return;
    this.wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  private scrollIfNeeded(): void {
    setTimeout(() => {
      if (this.wasAtBottom) {
        this.scrollToBottom();
      } else {
        this.showScrollBtn = true;
        this.cdr.markForCheck();
      }
    });
  }
}
