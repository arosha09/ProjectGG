import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../../services/auth.service';
import { TtsSettingsService, TtsSettings, TtsVoice } from '../../../services/tts-settings.service';
import {
  ApexPersonalityService,
  AiPersonality,
  PersonalityInfo,
  PersonalityPreset,
} from '../../../services/apex-personality.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, MatCheckboxModule],
  template: `
    @if (isAdmin) {
      <section class="admin-shell">
        <div class="admin-header">
          <span class="admin-badge">ADMIN PANEL</span>
          <h1>Server Settings</h1>
          <p class="admin-sub">
            Configure server-side features for {{ currentUser?.name || 'operator' }}
          </p>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <mat-icon svgIcon="flash_on"></mat-icon>
            <h2>APEX PERSONALITY</h2>
          </div>
          <p class="section-desc">Choose how APEX speaks and responds.</p>

          @if (personalityLoading) {
            <div class="sk-settings">
              <div class="sk-grid">
                <div class="sk-card"></div>
                <div class="sk-card"></div>
                <div class="sk-card"></div>
                <div class="sk-card"></div>
                <div class="sk-card"></div>
                <div class="sk-card"></div>
              </div>
            </div>
          } @else {
            <div class="setting-group">
              <div class="setting-label">PRESET</div>
              <div class="personality-grid">
                @for (p of personalityPresets; track p.id) {
                  <button
                    class="personality-card"
                    [class.active]="personality.preset === p.id"
                    type="button"
                    (click)="selectPersonality(p.id)"
                  >
                    <span class="personality-emoji">{{ p.emoji }}</span>
                    <span class="personality-name">{{ p.label }}</span>
                    <span class="personality-desc">{{ p.description }}</span>
                  </button>
                }
              </div>
            </div>

            @if (personality.preset === 'custom') {
              <div class="setting-group">
                <div class="setting-label">CUSTOM SYSTEM PROMPT</div>
                <textarea
                  class="personality-textarea"
                  rows="10"
                  [(ngModel)]="personality.custom_prompt"
                  (ngModelChange)="saved = false"
                  placeholder="You are APEX — describe how the AI should behave, what it knows, and how it should respond."
                ></textarea>
                <span class="setting-hint"
                  >This replaces the preset prompt entirely. Speaker-verification and
                  custom-vocabulary context is appended automatically.</span
                >
              </div>
            }

            <div class="setting-group">
              <button class="action-btn" type="button" (click)="showPreview = !showPreview">
                {{ showPreview ? 'HIDE PREVIEW' : 'SHOW EFFECTIVE PROMPT' }}
              </button>
              @if (showPreview) {
                <pre class="prompt-preview">{{ effectivePromptPreview }}</pre>
              }
            </div>
          }

          <div class="subsection-divider"></div>

          <div class="section-header">
            <mat-icon svgIcon="record_voice_over"></mat-icon>
            <h2>TEXT-TO-SPEECH (APEX)</h2>
          </div>
          <p class="section-desc">
            Configure the TTS provider and voices for the APEX AI assistant.
          </p>

          @if (loading) {
            <div class="sk-settings">
              <div class="sk-field">
                <div class="sk-label"></div>
                <div class="sk-input"></div>
              </div>
              <div class="sk-field">
                <div class="sk-label"></div>
                <div class="sk-input"></div>
              </div>
            </div>
          } @else {
            <!-- Provider Selection -->
            <div class="setting-label">PROVIDER</div>
            <div class="provider-grid">
              @for (p of providers; track p.id) {
                <button
                  class="provider-card"
                  [class.active]="settings.provider === p.id"
                  (click)="selectProvider(p.id)"
                >
                  <span class="provider-icon">{{ p.icon }}</span>
                  <span class="provider-name">{{ p.label }}</span>
                  <span class="provider-desc">{{ p.desc }}</span>
                </button>
              }
            </div>

            <!-- API Key for Google -->
            @if (settings.provider === 'google-tts') {
              <div class="setting-group">
                <div class="setting-label">GOOGLE CLOUD API KEY</div>
                <input
                  class="setting-input"
                  type="password"
                  [(ngModel)]="settings.google_api_key"
                  placeholder="AIzaSy..."
                />
                <span class="setting-hint"
                  >Get from
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener"
                    >Google Cloud Console</a
                  ></span
                >
              </div>
            }

            @if (settings.provider === 'webspeech') {
              <div class="setting-note">
                <mat-icon svgIcon="info"></mat-icon>
                <span
                  >Web Speech API runs in the browser. No server config needed. Quality varies by
                  browser/OS.</span
                >
              </div>
            }

            <!-- Voice Selection -->
            @if (settings.provider !== 'webspeech') {
              <div class="setting-group">
                <div class="setting-label">AVAILABLE VOICES</div>
                <p class="setting-hint-text">
                  Select which voices users can pick in the APEX panel.
                </p>

                <div class="voice-search-wrap">
                  <input
                    class="voice-search-input"
                    type="text"
                    placeholder="Search voices..."
                    [(ngModel)]="voiceSearch"
                    (input)="filterVoices()"
                  />
                  @if (voiceSearch) {
                    <button class="voice-search-clear" (click)="voiceSearch = ''; filterVoices()">
                      <span>✕</span>
                    </button>
                  }
                </div>

                <div class="voice-list">
                  @for (v of filteredVoices; track v.id) {
                    <div class="voice-card" [class.checked]="isVoiceEnabled(v.id)">
                      <div class="voice-row" (click)="onVoiceRowClick(v.id, $event)">
                        <mat-checkbox
                          [checked]="isVoiceEnabled(v.id)"
                          (change)="toggleVoice(v.id)"
                          (click)="$event.stopPropagation()"
                          color="primary"
                        ></mat-checkbox>
                        <span class="voice-name" (click)="startEditLabel(v, $event)" [title]="getVoiceLabel(v.id, v.label, v.gender) !== v.label ? 'Custom: ' + getVoiceLabel(v.id, v.label, v.gender) : 'Click to rename'">{{ getVoiceLabel(v.id, v.label, v.gender) }}</span>
                        @if (editingVoiceId === v.id) {
                          <input
                            class="voice-label-input"
                            type="text"
                            [(ngModel)]="editingVoiceLabel"
                            (blur)="saveLabel()"
                            (keyup.enter)="saveLabel()"
                            (keyup.escape)="cancelLabelEdit()"
                            (click)="$event.stopPropagation()"
                            autofocus
                          />
                        }
                        <span
                          class="voice-gender"
                          [class.female]="v.gender === 'Female'"
                          [class.male]="v.gender === 'Male'"
                        >
                          {{ v.gender }}
                        </span>
                        @if (
                          v.pitch ||
                          v.rate ||
                          hasOverride(v.id, 'pitch') ||
                          hasOverride(v.id, 'rate')
                        ) {
                          <span class="voice-tag voice-tag-robot">ROBOT</span>
                        }
                        @if (isDefaultVoice(v.id)) {
                          <span class="voice-tag voice-tag-default">DEFAULT</span>
                        }
                        <div class="voice-inline-actions">
                          <button
                            type="button"
                            class="voice-icon-btn"
                            (click)="testVoiceInline(v); $event.stopPropagation()"
                            [disabled]="testingVoiceId === v.id"
                            title="Test this voice"
                          >
                            @if (testingVoiceId === v.id) {
                              <mat-icon svgIcon="hourglass"></mat-icon>
                            } @else {
                              <mat-icon svgIcon="play_arrow"></mat-icon>
                            }
                          </button>
                          <button
                            type="button"
                            class="voice-icon-btn"
                            (click)="toggleTune(v.id); $event.stopPropagation()"
                            [class.active]="tuningVoiceId === v.id"
                            title="Tune pitch/rate"
                          >
                            <mat-icon svgIcon="tune"></mat-icon>
                          </button>
                          <button
                            type="button"
                            class="voice-icon-btn voice-default-star"
                            [class.is-default]="isDefaultVoice(v.id)"
                            (click)="setAsDefaultVoice(v.id); $event.stopPropagation()"
                            [disabled]="!isVoiceEnabled(v.id)"
                            title="Set as default voice"
                          >
                            <mat-icon
                              [svgIcon]="isDefaultVoice(v.id) ? 'star' : 'star_border'"
                            ></mat-icon>
                          </button>
                        </div>
                      </div>

                      @if (tuningVoiceId === v.id) {
                        <div class="voice-tune-panel" (click)="$event.stopPropagation()">
                          <div class="tune-hint">
                            Drag sliders or use + / - buttons to fine-tune
                            <strong>{{ v.label }}</strong
                            >.
                            <span class="tune-preset"
                              >Preset: pitch {{ v.pitch || 'default' }}, rate
                              {{ v.rate || 'default' }}</span
                            >
                          </div>
                          <div class="tune-fields">
                            <div class="tune-slider-wrap">
                              <div class="tune-slider-label">
                                <span>Pitch</span>
                                <span class="tune-slider-value">{{
                                  getOverrideDisplay(v.id, 'pitch') || '—'
                                }}</span>
                              </div>
                              <div class="tune-slider-row">
                                <button
                                  type="button"
                                  class="tune-step-btn"
                                  (click)="
                                    stepOverride(v.id, 'pitch', -1); $event.stopPropagation()
                                  "
                                >
                                  −
                                </button>
                                <input
                                  type="range"
                                  class="tune-slider"
                                  min="-50"
                                  max="50"
                                  step="1"
                                  [ngModel]="getOverrideNumeric(v.id, 'pitch')"
                                  (ngModelChange)="updateOverrideSlider(v.id, 'pitch', $event)"
                                />
                                <button
                                  type="button"
                                  class="tune-step-btn"
                                  (click)="stepOverride(v.id, 'pitch', 1); $event.stopPropagation()"
                                >
                                  +
                                </button>
                              </div>
                              <div class="tune-preset-value">
                                Preset: {{ v.pitch || 'default' }}
                              </div>
                            </div>
                            <div class="tune-slider-wrap">
                              <div class="tune-slider-label">
                                <span>Rate</span>
                                <span class="tune-slider-value">{{
                                  getOverrideDisplay(v.id, 'rate') || '—'
                                }}</span>
                              </div>
                              <div class="tune-slider-row">
                                <button
                                  type="button"
                                  class="tune-step-btn"
                                  (click)="stepOverride(v.id, 'rate', -1); $event.stopPropagation()"
                                >
                                  −
                                </button>
                                <input
                                  type="range"
                                  class="tune-slider"
                                  min="-150"
                                  max="150"
                                  step="5"
                                  [ngModel]="getOverrideNumeric(v.id, 'rate')"
                                  (ngModelChange)="updateOverrideSlider(v.id, 'rate', $event)"
                                />
                                <button
                                  type="button"
                                  class="tune-step-btn"
                                  (click)="stepOverride(v.id, 'rate', 1); $event.stopPropagation()"
                                >
                                  +
                                </button>
                              </div>
                              <div class="tune-preset-value">Preset: {{ v.rate || 'default' }}</div>
                            </div>
                            <div class="tune-actions">
                              <button
                                type="button"
                                class="tune-btn tune-reset"
                                (click)="resetOverride(v.id)"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                class="tune-btn tune-test"
                                (click)="testVoiceInline(v)"
                              >
                                Test
                              </button>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  }
                  @if (filteredVoices.length === 0) {
                    <div class="voice-empty">No voices match "{{ voiceSearch }}"</div>
                  }
                </div>

                <div class="voice-actions">
                  <button class="action-btn" (click)="selectAllVoices()">Select All</button>
                  <button class="action-btn" (click)="deselectAllVoices()">Deselect All</button>
                  <span class="voice-count">{{ enabledVoiceCount }} selected</span>
                </div>
              </div>

              <!-- Default Voice -->
              <div class="setting-group">
                <div class="setting-label">DEFAULT VOICE</div>
                <div class="cyber-select-wrap">
                  <button
                    class="cyber-select-trigger"
                    type="button"
                    (click)="defaultDropdownOpen = !defaultDropdownOpen"
                  >
                    <span class="sel-text">{{ getDefaultVoiceLabel() }}</span>
                    <span class="sel-arrow" [class.up]="defaultDropdownOpen">&#9660;</span>
                  </button>
                  @if (defaultDropdownOpen) {
                    <div class="cyber-select-popup">
                      @for (v of enabledVoicesOnly; track v.id) {
                        <button
                          class="cyber-select-option"
                          [class.active]="v.id === getDefaultVoiceId()"
                          type="button"
                          (click)="setDefaultVoice(v.id)"
                        >
                          {{ getVoiceLabel(v.id, v.label, v.gender) }}
                        </button>
                      }
                      @if (enabledVoicesOnly.length === 0) {
                        <div class="cyber-select-empty">No voices enabled</div>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Test Area -->
            @if (settings.provider !== 'webspeech') {
              <div class="setting-group test-area">
                <div class="setting-label">TEST TTS</div>
                <div class="test-row">
                  <input
                    class="setting-input test-input"
                    type="text"
                    [(ngModel)]="testText"
                    placeholder="Type something to test..."
                    (keyup.enter)="testSynthesize()"
                  />
                  <div class="cyber-select-wrap test-voice-select">
                    <button
                      class="cyber-select-trigger"
                      type="button"
                      (click)="testVoiceDropdownOpen = !testVoiceDropdownOpen"
                    >
                      <span class="sel-text">{{ getTestVoiceLabel() }}</span>
                      <span class="sel-arrow" [class.up]="testVoiceDropdownOpen">&#9660;</span>
                    </button>
                    @if (testVoiceDropdownOpen) {
                      <div class="cyber-select-popup">
                        @for (v of enabledVoicesOnly; track v.id) {
                          <button
                            class="cyber-select-option"
                            [class.active]="v.id === testVoice"
                            type="button"
                            (click)="testVoice = v.id; testVoiceDropdownOpen = false"
                          >
                            {{ getVoiceLabel(v.id, v.label, v.gender) }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                  <button class="test-play-btn" (click)="testSynthesize()" [disabled]="testing">
                    @if (testing) {
                      <mat-icon svgIcon="hourglass"></mat-icon>
                    } @else {
                      <mat-icon svgIcon="play_arrow"></mat-icon>
                    }
                  </button>
                </div>
                @if (testAudioUrl) {
                  <div class="test-result">
                    <mat-icon svgIcon="check_circle"></mat-icon>
                    <span>Audio ready</span>
                    <button class="test-stop-btn" (click)="stopTestAudio()">
                      <mat-icon svgIcon="stop"></mat-icon>
                    </button>
                  </div>
                }
                @if (testError) {
                  <div class="test-error">{{ testError }}</div>
                }
              </div>
            }

            @if (error) {
              <div class="setting-error">{{ error }}</div>
            }

            @if (saved) {
              <div class="setting-saved">
                <mat-icon svgIcon="check_circle"></mat-icon> Settings saved
              </div>
            }

            <button class="save-btn" (click)="save()" [disabled]="saving">
              {{ saving ? 'SAVING...' : 'SAVE SETTINGS' }}
            </button>
          }
        </div>
      </section>
    } @else {
      <section class="admin-shell">
        <div class="access-denied">
          <mat-icon svgIcon="block"></mat-icon>
          <h2>ACCESS RESTRICTED</h2>
          <p>Admin credentials required.</p>
        </div>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      h1,
      h2,
      h3 {
        text-shadow: none !important;
      }

      .admin-shell {
        max-width: 720px;
        margin: 0 auto;
        padding: 40px 24px;
      }

      .admin-header {
        margin-bottom: 40px;
        h1 {
          margin: 0 0 8px;
          font-size: 28px;
          font-weight: 800;
          color: #e9f9f3;
        }
        h1::after {
          content: '';
          display: block;
          width: 40px;
          height: 2px;
          margin-top: 8px;
          background: #ff2255;
          box-shadow: 0 0 8px rgba(255, 34, 85, 0.3);
        }
      }

      .admin-badge {
        display: inline-block;
        padding: 4px 14px;
        background: rgba(255, 34, 85, 0.12);
        border: 1px solid rgba(255, 34, 85, 0.25);
        color: #ff2255;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-bottom: 14px;
      }

      .admin-sub {
        margin: 0;
        font-size: 14px;
        color: rgba(230, 255, 240, 0.6);
      }

      .settings-section {
        background: rgba(12, 20, 30, 0.6);
        border: 1px solid rgba(255, 34, 85, 0.12);
        border-radius: 12px;
        padding: 28px;
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
        mat-icon {
          color: #ff2255;
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
        h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #e9f9f3;
        }
      }

      .section-desc {
        margin: 0 0 24px;
        font-size: 13px;
        color: rgba(230, 255, 240, 0.5);
      }

      .setting-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: rgba(230, 255, 240, 0.4);
        margin-bottom: 12px;
      }

      .setting-group {
        margin-top: 28px;
      }

      .setting-hint-text {
        margin: -8px 0 12px;
        font-size: 12px;
        color: rgba(230, 255, 240, 0.4);
      }

      /* Provider cards */
      .provider-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }

      .provider-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 16px 12px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s;
        color: rgba(230, 255, 240, 0.6);
        &:hover {
          border-color: rgba(255, 34, 85, 0.3);
          background: rgba(255, 34, 85, 0.04);
        }
        &.active {
          border-color: rgba(255, 34, 85, 0.5);
          background: rgba(255, 34, 85, 0.08);
          color: #e9f9f3;
          box-shadow: 0 0 20px rgba(255, 34, 85, 0.08);
        }
      }

      .provider-icon {
        font-size: 24px;
        line-height: 1;
      }
      .provider-name {
        font-size: 13px;
        font-weight: 700;
      }
      .provider-desc {
        font-size: 11px;
        color: rgba(230, 255, 240, 0.35);
        text-align: center;
        line-height: 1.3;
      }

      /* Inputs */
      .setting-input {
        width: 100%;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #e9f9f3;
        font-size: 14px;
        font-family: 'Share Tech Mono', monospace;
        outline: none;
        transition: border-color 0.2s;
        &:focus {
          border-color: rgba(255, 34, 85, 0.5);
        }
        &::placeholder {
          color: rgba(230, 255, 240, 0.3);
        }
      }

      .setting-hint {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: rgba(230, 255, 240, 0.35);
        a {
          color: #ff2255;
          text-decoration: none;
          &:hover {
            text-decoration: underline;
          }
        }
      }

      .setting-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 12px 16px;
        background: rgba(255, 215, 0, 0.06);
        border: 1px solid rgba(255, 215, 0, 0.15);
        border-radius: 8px;
        font-size: 13px;
        color: rgba(255, 215, 0, 0.8);
        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: #ffd700;
          flex-shrink: 0;
          margin-top: 1px;
        }
      }

      /* Voice search */
      .voice-search-wrap {
        position: relative;
        margin-bottom: 12px;
      }

      .voice-search-input {
        width: 100%;
        padding: 11px 36px 11px 14px;
        background: rgba(10, 16, 30, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #e9f9f3;
        font-size: 13px;
        font-family: 'Share Tech Mono', monospace;
        outline: none;
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
        box-sizing: border-box;
        &:focus {
          border-color: rgba(255, 34, 85, 0.4);
          box-shadow: 0 0 0 1px rgba(255, 34, 85, 0.15);
        }
        &::placeholder {
          color: rgba(230, 255, 240, 0.3);
        }
      }

      .voice-search-clear {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: rgba(255, 255, 255, 0.06);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
        span {
          font-size: 12px;
          color: rgba(230, 255, 240, 0.4);
          line-height: 1;
        }
        &:hover {
          background: rgba(255, 50, 50, 0.15);
          span {
            color: #ff6666;
          }
        }
      }

      /* Voice list */
      .voice-list {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        max-height: 280px;
        overflow-y: auto;
        &::-webkit-scrollbar {
          width: 6px;
        }
        &::-webkit-scrollbar-track {
          background: transparent;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
      }

      .voice-card {
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        transition: background 0.15s;
        &:last-child {
          border-bottom: none;
        }
        &:hover {
          background: rgba(255, 34, 85, 0.04);
        }
        &.checked {
          background: rgba(255, 34, 85, 0.06);
        }
      }

      .voice-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        cursor: pointer;
      }

      .voice-name {
        font-size: 13px;
        color: #e9f9f3;
        font-weight: 600;
        cursor: pointer;
        &:hover {
          color: #ff6b9d;
        }
      }

      .voice-label-input {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid #ff2255;
        color: #e9f9f3;
        font-size: 13px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        outline: none;
        width: 100px;
      }

      .voice-gender {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 700;
        letter-spacing: 0.5px;
        &.female {
          background: rgba(255, 100, 150, 0.12);
          color: #ff6b9d;
        }
        &.male {
          background: rgba(100, 150, 255, 0.12);
          color: #6b9dff;
        }
      }

      .voice-tag {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 1px;
        padding: 2px 6px;
        border-radius: 3px;
      }
      .voice-tag-robot {
        background: rgba(0, 229, 255, 0.12);
        color: #00e5ff;
        box-shadow: 0 0 8px rgba(0, 229, 255, 0.15);
      }
      .voice-tag-default {
        background: rgba(255, 215, 0, 0.12);
        color: #ffd700;
      }

      /* Inline action buttons on each voice row */
      .voice-inline-actions {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .voice-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        cursor: pointer;
        color: rgba(230, 255, 240, 0.5);
        transition: all 0.15s;
        flex-shrink: 0;
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
        &:hover:not(:disabled) {
          background: rgba(255, 34, 85, 0.12);
          border-color: rgba(255, 34, 85, 0.3);
          color: #ff2255;
        }
        &:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        &.active {
          background: rgba(0, 229, 255, 0.15);
          border-color: rgba(0, 229, 255, 0.4);
          color: #00e5ff;
        }
      }

      .voice-default-star {
        &.is-default {
          background: rgba(255, 215, 0, 0.15);
          border-color: rgba(255, 215, 0, 0.4);
          color: #ffd700;
        }
        &.is-default:hover:not(:disabled) {
          background: rgba(255, 215, 0, 0.2);
          border-color: rgba(255, 215, 0, 0.5);
          color: #ffd700;
        }
      }

      /* Tune panel */
      .voice-tune-panel {
        padding: 12px 14px 14px;
        background: rgba(0, 0, 0, 0.25);
        border-top: 1px solid rgba(0, 229, 255, 0.12);
      }

      .tune-slider-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 160px;
      }

      .tune-slider-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: rgba(230, 255, 240, 0.4);
      }

      .tune-slider-value {
        font-size: 12px;
        font-family: 'Share Tech Mono', monospace;
        color: #00e5ff;
        min-width: 36px;
        text-align: right;
      }

      .tune-slider-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tune-step-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: rgba(0, 229, 255, 0.1);
        border: 1px solid rgba(0, 229, 255, 0.3);
        border-radius: 5px;
        color: #00e5ff;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.15s;
        line-height: 1;
        padding: 0;
        font-family: 'Share Tech Mono', monospace;
        &:hover {
          background: rgba(0, 229, 255, 0.2);
          border-color: rgba(0, 229, 255, 0.5);
          transform: scale(1.05);
        }
        &:active {
          transform: scale(0.95);
        }
      }

      .tune-slider {
        -webkit-appearance: none;
        appearance: none;
        flex: 1;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
        &::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #00e5ff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
          transition: transform 0.1s;
          &:hover {
            transform: scale(1.15);
          }
        }
        &::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #00e5ff;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
        }
      }

      .tune-preset-value {
        font-size: 10px;
        color: rgba(230, 255, 240, 0.35);
        font-family: 'Share Tech Mono', monospace;
      }

      .tune-hint {
        font-size: 11px;
        color: rgba(230, 255, 240, 0.5);
        margin-bottom: 10px;
        line-height: 1.5;
        strong {
          color: #e9f9f3;
          font-weight: 600;
        }
        .tune-preset {
          display: block;
          margin-top: 4px;
          color: rgba(0, 229, 255, 0.7);
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
        }
      }

      .tune-fields {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }

      .tune-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 120px;
        label {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: rgba(230, 255, 240, 0.4);
        }
      }

      .tune-input {
        padding: 7px 10px;
        background: rgba(10, 16, 30, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #e9f9f3;
        font-size: 12px;
        font-family: 'Share Tech Mono', monospace;
        outline: none;
        transition: border-color 0.15s;
        &:focus {
          border-color: rgba(0, 229, 255, 0.5);
        }
        &::placeholder {
          color: rgba(230, 255, 240, 0.25);
        }
      }

      .tune-suggest {
        font-size: 10px;
        color: rgba(230, 255, 240, 0.3);
        font-family: 'Share Tech Mono', monospace;
      }

      .tune-actions {
        display: flex;
        gap: 6px;
        align-items: stretch;
      }

      .tune-btn {
        padding: 7px 14px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: all 0.15s;
        font-family: 'Share Tech Mono', monospace;
        border: 1px solid transparent;
      }
      .tune-reset {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.1);
        color: rgba(230, 255, 240, 0.6);
        &:hover {
          border-color: rgba(255, 100, 100, 0.4);
          color: #ff8888;
        }
      }
      .tune-test {
        background: rgba(0, 229, 255, 0.15);
        border-color: rgba(0, 229, 255, 0.4);
        color: #00e5ff;
        &:hover {
          background: rgba(0, 229, 255, 0.25);
          box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
        }
      }

      .voice-empty {
        padding: 20px;
        text-align: center;
        font-size: 13px;
        color: rgba(230, 255, 240, 0.3);
      }

      .voice-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }

      .action-btn {
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: rgba(230, 255, 240, 0.6);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        font-family: 'Share Tech Mono', monospace;
        &:hover {
          border-color: rgba(255, 34, 85, 0.3);
          color: #e9f9f3;
        }
      }

      .voice-count {
        margin-left: auto;
        font-size: 11px;
        color: rgba(230, 255, 240, 0.4);
      }

      /* Cyber select (for default voice) */
      .cyber-select-wrap {
        position: relative;
      }

      .cyber-select-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #e9f9f3;
        font-size: 13px;
        font-family: 'Share Tech Mono', monospace;
        cursor: pointer;
        transition: border-color 0.2s;
        &:hover {
          border-color: rgba(255, 34, 85, 0.3);
        }
      }

      .sel-text {
        text-align: left;
      }
      .sel-arrow {
        font-size: 10px;
        transition: transform 0.2s;
        &.up {
          transform: rotate(180deg);
        }
      }

      .cyber-select-popup {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 4px;
        background: linear-gradient(135deg, rgba(10, 16, 32, 0.98), rgba(8, 14, 26, 0.98));
        border: 1px solid rgba(255, 34, 85, 0.25);
        border-radius: 8px;
        z-index: 100;
        max-height: 200px;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        &::-webkit-scrollbar {
          width: 4px;
        }
        &::-webkit-scrollbar-track {
          background: transparent;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
      }

      .cyber-select-option {
        display: block;
        width: 100%;
        padding: 10px 14px;
        background: none;
        border: none;
        color: rgba(230, 255, 240, 0.6);
        font-size: 12px;
        font-family: 'Share Tech Mono', monospace;
        text-align: left;
        cursor: pointer;
        transition: all 0.15s;
        &:first-child {
          border-radius: 8px 8px 0 0;
        }
        &:last-child {
          border-radius: 0 0 8px 8px;
        }
        &:hover {
          background: rgba(255, 34, 85, 0.08);
          color: #e9f9f3;
        }
        &.active {
          color: #ff2255;
          background: rgba(255, 34, 85, 0.06);
        }
      }

      .cyber-select-empty {
        padding: 12px 14px;
        font-size: 12px;
        color: rgba(230, 255, 240, 0.3);
        text-align: center;
      }

      /* Test area */
      .test-area {
        padding-top: 28px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      .test-row {
        display: flex;
        gap: 8px;
        align-items: stretch;
      }

      .test-input {
        flex: 1;
      }
      .test-voice-select {
        width: 200px;
        flex-shrink: 0;
      }

      .test-play-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        background: rgba(255, 34, 85, 0.15);
        border: 1px solid rgba(255, 34, 85, 0.4);
        border-radius: 8px;
        color: #ff2255;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
        &:hover:not(:disabled) {
          background: rgba(255, 34, 85, 0.25);
          box-shadow: 0 0 12px rgba(255, 34, 85, 0.15);
        }
        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }

      .test-result {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: 12px;
        color: #4cff8c;
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .test-stop-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
          color: #ff6666;
        }
      }

      .test-error {
        margin-top: 8px;
        padding: 8px 12px;
        background: rgba(255, 50, 50, 0.08);
        border: 1px solid rgba(255, 50, 50, 0.2);
        border-radius: 6px;
        font-size: 12px;
        color: #ff6666;
      }

      .setting-error {
        margin-top: 12px;
        padding: 10px 14px;
        background: rgba(255, 50, 50, 0.08);
        border: 1px solid rgba(255, 50, 50, 0.2);
        border-radius: 8px;
        font-size: 13px;
        color: #ff6666;
      }

      .setting-saved {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        font-size: 13px;
        color: #4cff8c;
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .save-btn {
        margin-top: 28px;
        padding: 12px 32px;
        background: rgba(255, 34, 85, 0.15);
        border: 1px solid rgba(255, 34, 85, 0.4);
        border-radius: 8px;
        color: #ff2255;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 2px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s;
        font-family: 'Share Tech Mono', monospace;
        &:hover:not(:disabled) {
          background: rgba(255, 34, 85, 0.25);
          box-shadow: 0 0 20px rgba(255, 34, 85, 0.15);
        }
        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }

      .sk-settings {
        padding: 10px 0;
      }
      .sk-field {
        margin-bottom: 20px;
      }
      .sk-label {
        width: 80px;
        height: 12px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        margin-bottom: 8px;
      }
      .sk-input {
        width: 100%;
        height: 40px;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 8px;
      }

      .access-denied {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        gap: 16px;
        text-align: center;
        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
          color: rgba(255, 34, 85, 0.4);
        }
        h2 {
          margin: 0;
          font-size: 22px;
          color: #e9f9f3;
          letter-spacing: 2px;
        }
        p {
          margin: 0;
          font-size: 14px;
          color: rgba(230, 255, 240, 0.5);
        }
      }
    `,
  ],
})
export class AdminSettingsComponent implements OnInit {
  loading = true;
  saving = false;
  saved = false;
  error = '';

  currentUser: any;
  settings: TtsSettings = {
    provider: 'edge-tts',
    edge_voice: 'en-US-AndrewMultilingualNeural',
    google_voice: 'en-US-Neural2-H',
    google_api_key: '',
    enabled_voices: [
      'en-US-AndrewMultilingualNeural',
      'en-US-AvaMultilingualNeural',
      'en-US-SteffanNeural',
      'en-US-AriaNeural',
      'en-US-GuyNeural',
    ],
    voice_overrides: {},
    voice_labels: {},
  };
  allVoices: TtsVoice[] = [];
  filteredVoices: TtsVoice[] = [];
  voiceSearch = '';
  defaultDropdownOpen = false;
  testVoiceDropdownOpen = false;

  testText = 'Hello, this is a test of the APEX voice system.';
  testVoice = 'en-US-AndrewMultilingualNeural';
  testAudioUrl: string | null = null;
  testError = '';
  testing = false;
  private testAudio: HTMLAudioElement | null = null;

  tuningVoiceId: string | null = null;
  testingVoiceId: string | null = null;
  editingVoiceId: string | null = null;
  editingVoiceLabel = '';
  private inlineTestAudio: HTMLAudioElement | null = null;

  personalityLoading = true;
  personality: AiPersonality = { preset: 'gaming-buddy', custom_prompt: '' };
  personalityPresets: PersonalityInfo[] = [];
  showPreview = false;

  providers = [
    {
      id: 'edge-tts' as const,
      icon: '\u26A1',
      label: 'Edge TTS',
      desc: 'Free, no API key, Microsoft voices',
    },
    {
      id: 'google-tts' as const,
      icon: '\u2601\uFE0F',
      label: 'Google Cloud',
      desc: '1M chars/month free, excellent quality',
    },
    {
      id: 'webspeech' as const,
      icon: '\uD83C\uDF10',
      label: 'Web Speech',
      desc: 'Browser-native, no server needed',
    },
  ];

  constructor(
    private readonly auth: AuthService,
    private readonly ttsSettings: TtsSettingsService,
    private readonly personalityService: ApexPersonalityService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  private loadPersonality(): void {
    this.personalityLoading = true;
    this.personalityService.getPersonality().subscribe({
      next: (res) => {
        this.personality = res.personality;
        this.personalityPresets = res.presets;
        this.personalityLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.personalityLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectPersonality(preset: PersonalityPreset): void {
    this.personality = { ...this.personality, preset };
    this.saved = false;
  }

  get effectivePromptPreview(): string {
    const preset = this.personalityPresets.find((p) => p.id === this.personality.preset);
    if (this.personality.preset === 'custom') {
      const trimmed = this.personality.custom_prompt.trim();
      return trimmed || '[No custom prompt set. Select a preset or write a custom one.]';
    }
    const hint = preset ? `${preset.emoji} ${preset.label} — ` : '';
    return hint + `[Preview not available. Save and APEX will use this preset at runtime.]`;
  }

  get enabledVoicesOnly(): TtsVoice[] {
    return this.allVoices.filter((v) => this.isVoiceEnabled(v.id));
  }

  get enabledVoiceCount(): number {
    return (this.settings.enabled_voices || []).length;
  }

  ngOnInit(): void {
    this.currentUser = this.auth.getCurrentUser();
    this.loadSettings();
    this.loadPersonality();
  }

  selectProvider(id: 'edge-tts' | 'google-tts' | 'webspeech'): void {
    this.settings = { ...this.settings, provider: id };
    this.updateVoiceList();
    this.saved = false;
  }

  isVoiceEnabled(id: string): boolean {
    return (this.settings.enabled_voices || []).includes(id);
  }

  toggleVoice(id: string): void {
    const enabled = [...(this.settings.enabled_voices || [])];
    const idx = enabled.indexOf(id);
    if (idx >= 0) {
      enabled.splice(idx, 1);
    } else {
      enabled.push(id);
    }
    this.settings = { ...this.settings, enabled_voices: enabled };
    this.saved = false;
  }

  selectAllVoices(): void {
    this.settings = { ...this.settings, enabled_voices: this.allVoices.map((v) => v.id) };
    this.saved = false;
  }

  deselectAllVoices(): void {
    this.settings = { ...this.settings, enabled_voices: [] };
    this.saved = false;
  }

  filterVoices(): void {
    const q = this.voiceSearch.toLowerCase();
    this.filteredVoices = q
      ? this.allVoices.filter(
          (v) =>
            v.label.toLowerCase().includes(q) ||
            v.gender.toLowerCase().includes(q) ||
            v.id.toLowerCase().includes(q),
        )
      : [...this.allVoices];
  }

  getDefaultVoiceId(): string {
    return this.settings.provider === 'google-tts'
      ? this.settings.google_voice
      : this.settings.edge_voice;
  }

  getDefaultVoiceLabel(): string {
    const id = this.getDefaultVoiceId();
    const v = this.allVoices.find((x) => x.id === id);
    return v ? this.getVoiceLabel(v.id, v.label, v.gender) : id;
  }

  setDefaultVoice(id: string): void {
    if (this.settings.provider === 'google-tts') {
      this.settings = { ...this.settings, google_voice: id };
    } else {
      this.settings = { ...this.settings, edge_voice: id };
    }
    this.defaultDropdownOpen = false;
    this.testVoice = id;
    this.saved = false;
  }

  isDefaultVoice(id: string): boolean {
    return id === this.getDefaultVoiceId();
  }

  setAsDefaultVoice(id: string): void {
    this.setDefaultVoice(id);
  }

  onVoiceRowClick(voiceId: string, event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button, mat-checkbox, .voice-tune-panel')) return;
    this.toggleVoice(voiceId);
  }

  toggleTune(voiceId: string): void {
    this.tuningVoiceId = this.tuningVoiceId === voiceId ? null : voiceId;
    this.cdr.markForCheck();
  }

  hasOverride(voiceId: string, field: 'pitch' | 'rate'): boolean {
    const ov = this.settings.voice_overrides?.[voiceId];
    return !!(ov?.[field] && ov[field]!.trim());
  }

  getOverride(voiceId: string, field: 'pitch' | 'rate'): string {
    return this.settings.voice_overrides?.[voiceId]?.[field] || '';
  }

  updateOverride(voiceId: string, field: 'pitch' | 'rate', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const overrides = { ...(this.settings.voice_overrides || {}) };
    const current = { ...(overrides[voiceId] || {}) };
    if (value.trim()) {
      current[field] = value;
    } else {
      delete current[field];
    }
    if (Object.keys(current).length === 0) {
      delete overrides[voiceId];
    } else {
      overrides[voiceId] = current;
    }
    this.settings = { ...this.settings, voice_overrides: overrides };
    this.saved = false;
  }

  resetOverride(voiceId: string): void {
    const overrides = { ...(this.settings.voice_overrides || {}) };
    delete overrides[voiceId];
    this.settings = { ...this.settings, voice_overrides: overrides };
    this.saved = false;
  }

  getOverrideDisplay(voiceId: string, field: 'pitch' | 'rate'): string {
    const val = this.settings.voice_overrides?.[voiceId]?.[field];
    return val || '';
  }

  stepOverride(voiceId: string, field: 'pitch' | 'rate', amount: number): void {
    const current = this.getOverrideNumeric(voiceId, field);
    const newVal = current + amount;
    const min = field === 'pitch' ? -50 : -150;
    const max = field === 'pitch' ? 50 : 150;
    const clamped = Math.max(min, Math.min(max, newVal));

    const overrides = { ...(this.settings.voice_overrides || {}) };
    const currentOverride = { ...(overrides[voiceId] || {}) };

    if (clamped === 0) {
      delete currentOverride[field];
    } else {
      currentOverride[field] =
        field === 'pitch'
          ? `${clamped >= 0 ? '+' : ''}${clamped}Hz`
          : `${clamped >= 0 ? '+' : ''}${clamped}%`;
    }

    if (Object.keys(currentOverride).length === 0) {
      delete overrides[voiceId];
    } else {
      overrides[voiceId] = currentOverride;
    }
    this.settings = { ...this.settings, voice_overrides: overrides };
    this.saved = false;
  }

  getOverrideNumeric(voiceId: string, field: 'pitch' | 'rate'): number {
    const val = this.settings.voice_overrides?.[voiceId]?.[field];
    if (!val) return 0;
    return parseInt(val.replace(/[^\d-]/g, ''), 10) || 0;
  }

  updateOverrideSlider(voiceId: string, field: 'pitch' | 'rate', event: Event | number): void {
    const num =
      typeof event === 'number' ? event : parseInt((event.target as HTMLInputElement).value, 10);
    const overrides = { ...(this.settings.voice_overrides || {}) };
    const current = { ...(overrides[voiceId] || {}) };
    if (num === 0) {
      delete current[field];
    } else {
      current[field] =
        field === 'pitch' ? `${num >= 0 ? '+' : ''}${num}Hz` : `${num >= 0 ? '+' : ''}${num}%`;
    }
    if (Object.keys(current).length === 0) {
      delete overrides[voiceId];
    } else {
      overrides[voiceId] = current;
    }
    this.settings = { ...this.settings, voice_overrides: overrides };
    this.saved = false;
    this.cdr.markForCheck();
  }

  getVoiceLabel(voiceId: string, defaultLabel: string, gender?: string): string {
    const customLabel = this.settings.voice_labels?.[voiceId];
    if (customLabel) {
      return customLabel;
    }
    if (gender === 'Male') {
      return `${this.extractVoiceBaseName(voiceId)} - MALE`;
    }
    return defaultLabel;
  }

  extractVoiceBaseName(voiceId: string): string {
    const parts = voiceId.split('-');
    if (parts.length >= 3) {
      const namePart = parts[2];
      const cleanName = namePart
        .replace(/Multilingual/g, '')
        .replace(/Neural$/g, '')
        .replace(/(\d+)/g, '');
      return cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
    }
    return voiceId;
  }

  updateVoiceLabel(voiceId: string, label: string): void {
    const labels = { ...(this.settings.voice_labels || {}) };
    if (label.trim() && label !== this.allVoices.find(v => v.id === voiceId)?.label) {
      labels[voiceId] = label.trim();
    } else {
      delete labels[voiceId];
    }
    this.settings = { ...this.settings, voice_labels: labels };
    this.saved = false;
    this.cdr.markForCheck();
  }

  startEditLabel(v: TtsVoice, event: MouseEvent): void {
    event.stopPropagation();
    this.editingVoiceId = v.id;
    this.editingVoiceLabel = this.getVoiceLabel(v.id, v.label, v.gender);
    this.cdr.markForCheck();
  }

  saveLabel(): void {
    if (this.editingVoiceId) {
      this.updateVoiceLabel(this.editingVoiceId, this.editingVoiceLabel);
      this.editingVoiceId = null;
      this.editingVoiceLabel = '';
      this.cdr.markForCheck();
    }
  }

  cancelLabelEdit(): void {
    this.editingVoiceId = null;
    this.editingVoiceLabel = '';
    this.cdr.markForCheck();
  }

  testVoiceInline(v: TtsVoice): void {
    if (this.testingVoiceId) return;
    this.testingVoiceId = v.id;
    this.cdr.markForCheck();

    const url = `${this.ttsSettings.apiUrl}/speak`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: this.testText,
        voice: v.id,
        overrides: this.settings.voice_overrides?.[v.id],
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'TTS failed' }));
          throw new Error(err.message);
        }
        return res.blob();
      })
      .then((blob) => {
        if (this.inlineTestAudio) {
          this.inlineTestAudio.pause();
          this.inlineTestAudio.src = '';
        }
        const url = URL.createObjectURL(blob);
        this.inlineTestAudio = new Audio(url);
        this.inlineTestAudio.onended = () => URL.revokeObjectURL(url);
        this.inlineTestAudio.play();
        this.testingVoiceId = null;
        this.cdr.markForCheck();
      })
      .catch((err) => {
        this.testError = err.message || 'Test failed';
        this.testingVoiceId = null;
        this.cdr.markForCheck();
      });
  }

  getTestVoiceLabel(): string {
    const v = this.allVoices.find((x) => x.id === this.testVoice);
    return v ? this.getVoiceLabel(v.id, v.label, v.gender) : this.testVoice;
  }

  testSynthesize(): void {
    if (!this.testText.trim() || this.testing) return;
    this.testing = true;
    this.testError = '';
    this.testAudioUrl = null;
    this.stopTestAudio();
    this.cdr.markForCheck();

    const url = `${this.ttsSettings.apiUrl}/speak`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: this.testText, voice: this.testVoice }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'TTS failed' }));
          throw new Error(err.message);
        }
        return res.blob();
      })
      .then((blob) => {
        this.testAudioUrl = URL.createObjectURL(blob);
        this.testAudio = new Audio(this.testAudioUrl);
        this.testAudio.play();
        this.testing = false;
        this.cdr.markForCheck();
      })
      .catch((err) => {
        this.testError = err.message || 'Test failed';
        this.testing = false;
        this.cdr.markForCheck();
      });
  }

  stopTestAudio(): void {
    if (this.testAudio) {
      this.testAudio.pause();
      this.testAudio.src = '';
      this.testAudio = null;
    }
    if (this.testAudioUrl) {
      URL.revokeObjectURL(this.testAudioUrl);
      this.testAudioUrl = null;
    }
  }

  private loadSettings(): void {
    this.loading = true;
    this.ttsSettings.getSettings().subscribe({
      next: (res) => {
        this.settings = {
          provider: res.provider,
          edge_voice: res.edge_voice,
          google_voice: res.google_voice,
          google_api_key: res.google_api_key,
          enabled_voices: res.enabled_voices || [],
          voice_overrides: res.voice_overrides || {},
          voice_labels: res.voice_labels || {},
        };
        const voices = res.voices || { edge: [], google: [] };
        this.allVoices = res.provider === 'google-tts' ? voices.google : voices.edge;
        this.filteredVoices = [...this.allVoices];
        this.testVoice = this.getDefaultVoiceId();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private updateVoiceList(): void {
    this.ttsSettings.getSettings().subscribe({
      next: (res) => {
        const voices = res.voices || { edge: [], google: [] };
        this.allVoices = this.settings.provider === 'google-tts' ? voices.google : voices.edge;
        this.filterVoices();
        this.testVoice = this.getDefaultVoiceId();
        this.cdr.markForCheck();
      },
    });
  }

  save(): void {
    this.saving = true;
    this.saved = false;
    this.error = '';
    this.cdr.markForCheck();

    this.ttsSettings.saveSettings(this.settings).subscribe({
      next: (res) => {
        this.saving = false;
        this.saved = true;
        this.settings = { ...this.settings, ...res };
        setTimeout(() => {
          this.saved = false;
          this.cdr.markForCheck();
        }, 3000);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Failed to save settings';
        this.cdr.markForCheck();
      },
    });
  }
}
