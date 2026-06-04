import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostBinding } from '@angular/core';
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
  templateUrl: './apex-chat.component.html',
  styleUrls: ['./apex-chat.component.scss'],
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

  private stateSub?: Subscription;
  private wakeWordSub?: Subscription;

  constructor(
    private apexService: ApexService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.isSupported = this.apexService.isSpeechRecognitionSupported();
    this.apexService.loadVoices();

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

  async startListening(): Promise<void> {
    if (this.voiceMode === 'push-to-talk' || this.voiceMode === 'always-listening') {
      this.apexService.startListening();
    }
  }

  stopListening(): void {
    this.apexService.stopListening();
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
    this.apexService.setVoiceMode(mode);
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