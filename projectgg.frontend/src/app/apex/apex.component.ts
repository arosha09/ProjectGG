import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostBinding, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { ApexService } from './apex.service';
import { VoiceTrainingComponent } from './voice-training/voice-training.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-apex-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatInputModule, VoiceTrainingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apex.component.html',
  styleUrls: ['./apex.component.scss'],
})
export class ApexChatComponent implements OnInit, OnDestroy {
  @HostBinding('class.expanded') get isExpanded(): boolean { return this.isPanelOpen; }
  @HostBinding('class.loaded') isLoaded = false;
  isPanelOpen = false;
  isRecording = false;
  isListening = false;
  transcribedText = '';
  voiceOutputEnabled = false;
  voiceMode: 'push-to-talk' | 'always-listening' | 'wake-word' = 'push-to-talk';
  selectedVoice: SpeechSynthesisVoice | null = null;
  speechRate = 1.0;
  availableVoices: SpeechSynthesisVoice[] = [];

  showTraining = false;
  showSettings = false;
  isSupported = false;
  micHeld = false;
  apexResponse = '';
  pendingAiQuery = false;

  private stateSub?: Subscription;
  private wakeWordSub?: Subscription;

  constructor(
    private apexService: ApexService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {}

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isPanelOpen) {
      this.isPanelOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isPanelOpen) return;
    const target = event.target as HTMLElement;
    if (!this.elRef.nativeElement.contains(target)) {
      this.isPanelOpen = false;
      this.cdr.markForCheck();
    }
  }

  ngOnInit(): void {
    this.isSupported = this.apexService.isSpeechRecognitionSupported();
    this.apexService.loadVoices();
    this.apexService.primeMicPermission();

    setTimeout(() => {
      this.isLoaded = true;
      this.cdr.markForCheck();
    }, 1000);

    this.stateSub = this.apexService.state$.subscribe(state => {
      console.log('[ApexChat] state$ emitted:', JSON.stringify({
        isListening: state.isListening,
        isRecording: state.isRecording,
        transcribedText: state.transcribedText,
        voiceMode: state.voiceMode,
        wakeWordDetected: state.wakeWordDetected,
      }));
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
    this.apexService.stopListening();
  }

  togglePanel(): void {
    this.isPanelOpen = !this.isPanelOpen;
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  openTraining(): void {
    this.showTraining = true;
    this.isPanelOpen = false;
  }

  closeTraining(): void {
    this.showTraining = false;
  }

  onMicPointerDown(_event: Event): void {
    console.log('[ApexChat] === pointerDown fired ===', {
      voiceMode: this.voiceMode,
      micHeld: this.micHeld,
      isListening: this.isListening,
      transcribedText: this.transcribedText,
    });
    this.micHeld = true;
    if (this.voiceMode === 'push-to-talk' || this.voiceMode === 'always-listening') {
      console.log('[ApexChat] calling startListening()');
      this.apexService.startListening();
    } else {
      console.log('[ApexChat] skipping startListening — mode is wake-word');
    }
  }

  onMicPointerUp(_event: Event): void {
    console.log('[ApexChat] === pointerUp fired ===', {
      micHeld: this.micHeld,
      transcribedText: this.transcribedText,
      pendingAiQuery: this.pendingAiQuery,
    });
    if (!this.micHeld) {
      console.log('[ApexChat] micHeld was false, skipping');
      return;
    }
    this.micHeld = false;

    console.log('[ApexChat] calling stopListening()');
    this.apexService.stopListening();

    setTimeout(() => {
      const text = this.transcribedText;
      const state = this.apexService.getState();
      console.log('[ApexChat] setTimeout callback — text:', JSON.stringify(text), '| state:', JSON.stringify(state));

      if (!text || this.pendingAiQuery) {
        console.log('[ApexChat] skipping AI query — text:', !!text, 'pending:', this.pendingAiQuery);
        return;
      }

      this.pendingAiQuery = true;
      this.apexResponse = '';
      this.cdr.markForCheck();

      this.apexService.askAi(text).subscribe({
        next: (res) => {
          console.log('[ApexChat] AI response:', JSON.stringify(res.response));
          this.apexResponse = res.response;
          this.pendingAiQuery = false;
          this.apexService.speak(res.response);
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[ApexChat] API error:', err);
          this.apexResponse = 'Failed to get response. Try again.';
          this.pendingAiQuery = false;
          this.cdr.markForCheck();
        },
      });
    }, 300);
  }

  getTranscribedAndClear(): string {
    const text = this.apexService.getTranscribedText();
    this.apexService.clearTranscribedText();
    return text;
  }

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
}
