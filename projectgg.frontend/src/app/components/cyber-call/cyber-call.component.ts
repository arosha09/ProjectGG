import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CallService, IncomingCall, ActiveCall, QUICK_REPLIES, QuickReply } from '../../services/call.service';
import { VoiceNudgeService } from '../../services/voice-nudge.service';

@Component({
  selector: 'app-cyber-call',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <!-- OUTGOING CALL (full overlay) -->
    @if (outgoingCall && !activeCall) {
      <div class="call-overlay">
        <div class="call-container">
          <div class="call-glow"></div>
          <div class="call-scanline"></div>
          <div class="call-content">
            <div class="call-spectrum">
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
            </div>
            <div class="call-label">CALLING<span class="call-dots"><span>.</span><span>.</span><span>.</span></span></div>
            <div class="call-avatar-wrap">
              @if (peerAvatar) {
                <img [src]="peerAvatar" alt="" class="call-avatar" />
              } @else {
                <div class="call-avatar-placeholder">
                  <mat-icon svgIcon="person"></mat-icon>
                </div>
              }
              <div class="call-avatar-ring"></div>
            </div>
            <div class="call-username">{{ peerName }}</div>
            <div class="call-actions">
              <button class="call-btn call-btn-decline" (click)="onCancel()">
                <mat-icon svgIcon="call_end"></mat-icon>
                <span>Cancel</span>
              </button>
            </div>
          </div>
          <div class="call-corner call-corner-tl"></div>
          <div class="call-corner call-corner-tr"></div>
          <div class="call-corner call-corner-bl"></div>
          <div class="call-corner call-corner-br"></div>
        </div>
      </div>
    }

    <!-- INCOMING CALL (full overlay) -->
    @if (incomingCall && !activeCall) {
      <div class="call-overlay">
        <div class="call-container">
          <div class="call-glow"></div>
          <div class="call-scanline"></div>
          <div class="call-content">
            <div class="call-spectrum">
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
              <div class="spectrum-bar"></div><div class="spectrum-bar"></div><div class="spectrum-bar"></div>
            </div>
            <div class="call-label">INCOMING CALL</div>
            <div class="call-avatar-wrap">
              @if (incomingCall.callerAvatar) {
                <img [src]="incomingCall.callerAvatar" alt="" class="call-avatar" />
              } @else {
                <div class="call-avatar-placeholder">
                  <mat-icon svgIcon="person"></mat-icon>
                </div>
              }
              <div class="call-avatar-ring"></div>
            </div>
            <div class="call-username">{{ incomingCall.callerName }}</div>
            @if (incomingCall.channelId && incomingCall.guildId) {
              <div class="call-vc-invite">
                <mat-icon svgIcon="call"></mat-icon>
                Voice Channel Invite
              </div>
            }
            <div class="call-quick-replies">
              @for (reply of quickReplies; track reply.id) {
                <button class="quick-reply-btn" (click)="onQuickReply(reply.id)">
                  <mat-icon [svgIcon]="reply.icon"></mat-icon>
                  <span>{{ reply.label }}</span>
                </button>
              }
            </div>
            <div class="call-actions">
              <button class="call-btn call-btn-decline" (click)="onDecline()">
                <mat-icon svgIcon="close"></mat-icon>
                <span>Decline</span>
              </button>
              <button class="call-btn call-btn-accept" (click)="onAccept()">
                <mat-icon svgIcon="call"></mat-icon>
                <span>Accept</span>
              </button>
            </div>
          </div>
          <div class="call-corner call-corner-tl"></div>
          <div class="call-corner call-corner-tr"></div>
          <div class="call-corner call-corner-bl"></div>
          <div class="call-corner call-corner-br"></div>
        </div>
      </div>
    }

    <!-- ACTIVE CALL: COMPACT (floating, draggable) -->
    @if (activeCall && !expanded) {
      <div class="call-compact" [style.left.px]="compactX" [style.top.px]="compactY" (contextmenu)="onContextMenu($event)">
        <div class="call-compact-glow"></div>
        <div class="call-compact-inner">
          <div class="call-compact-drag" (mousedown)="onDragStart($event)">
            <div class="call-compact-peer">
              <div class="call-compact-avatar-wrap">
                @if (peerAvatar) {
                  <img [src]="peerAvatar" alt="" class="call-compact-avatar" />
                } @else {
                  <div class="call-compact-avatar-placeholder">
                    <mat-icon svgIcon="person"></mat-icon>
                  </div>
                }
                <div class="call-compact-avatar-ring"></div>
              </div>
              <div class="call-compact-info">
                <span class="call-compact-name">{{ peerName }}</span>
                <span class="call-compact-status">{{ callTimer }}</span>
              </div>
            </div>
          </div>
          <div class="call-compact-controls">
            <button class="call-ctrl-btn" [class.active]="localMuted" (click)="toggleMute()" [title]="localMuted ? 'Unmute' : 'Mute'">
              <mat-icon [svgIcon]="localMuted ? 'mic_off' : 'mic'"></mat-icon>
            </button>
            <button class="call-ctrl-btn" [class.active]="localDeafened" (click)="toggleDeafen()" [title]="localDeafened ? 'Undeafen' : 'Deafen'">
              <mat-icon [svgIcon]="localDeafened ? 'hearing_disabled' : 'hearing'"></mat-icon>
            </button>
            <button class="call-ctrl-btn call-ctrl-end" (click)="onEnd()" title="End Call">
              <mat-icon svgIcon="call_end"></mat-icon>
            </button>
            <button class="call-ctrl-btn call-ctrl-expand" (click)="expand()" title="Expand">
              <mat-icon svgIcon="fullscreen"></mat-icon>
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ACTIVE CALL: EXPANDED (replaces chat view) -->
    @if (activeCall && expanded) {
      <div class="call-expanded">
        <div class="call-expanded-glow"></div>
        <div class="call-expanded-scanline"></div>

        <div class="call-expanded-header">
          <span class="call-expanded-title">VOICE CALL</span>
          <span class="call-expanded-duration">{{ callTimer }}</span>
        </div>

        <div class="call-expanded-center">
          <div class="call-expanded-avatar-wrap">
            @if (peerAvatar) {
              <img [src]="peerAvatar" alt="" class="call-expanded-avatar" />
            } @else {
              <div class="call-expanded-avatar-placeholder">
                <mat-icon svgIcon="person"></mat-icon>
              </div>
            }
            <div class="call-expanded-avatar-ring"></div>
            <div class="call-expanded-avatar-glow"></div>
          </div>
          <div class="call-expanded-peer-name">{{ peerName }}</div>
        </div>

        <div class="call-expanded-controls">
          <button class="call-ctrl-lg" [class.active]="localMuted" (click)="toggleMute()" [title]="localMuted ? 'Unmute' : 'Mute'">
            <mat-icon [svgIcon]="localMuted ? 'mic_off' : 'mic'"></mat-icon>
            <span>{{ localMuted ? 'Unmute' : 'Mute' }}</span>
          </button>
          <button class="call-ctrl-lg" [class.active]="localDeafened" (click)="toggleDeafen()" [title]="localDeafened ? 'Undeafen' : 'Deafen'">
            <mat-icon [svgIcon]="localDeafened ? 'hearing_disabled' : 'hearing'"></mat-icon>
            <span>{{ localDeafened ? 'Undeafen' : 'Deafen' }}</span>
          </button>
          <button class="call-ctrl-lg call-ctrl-nudge" (click)="onNudge()" [disabled]="!canNudge" [title]="canNudge ? 'Nudge' : 'Nudge on cooldown'">
            <mat-icon svgIcon="vibration"></mat-icon>
            <span>Nudge</span>
          </button>
          <button class="call-ctrl-lg call-ctrl-end-lg" (click)="onEnd()">
            <mat-icon svgIcon="call_end"></mat-icon>
            <span>End</span>
          </button>
        </div>

        <div class="call-expanded-volume">
          <mat-icon class="call-volume-icon" [svgIcon]="localDeafened ? 'volume_off' : 'volume_up'"></mat-icon>
          <input type="range" class="call-volume-slider" min="0" max="100" [value]="remoteVolume" (input)="onVolumeChange($event)" [disabled]="localDeafened" />
          <span class="call-volume-label">{{ remoteVolume }}%</span>
        </div>

        <div class="call-expanded-actions">
          <button class="call-collapse-btn" (click)="collapse()">
            <mat-icon svgIcon="fullscreen_exit"></mat-icon>
            <span>Minimize</span>
          </button>
        </div>
      </div>
    }

    <!-- Context menu -->
    @if (contextMenuOpen) {
      <div class="call-ctx-backdrop" (click)="closeContextMenu()"></div>
      <div class="call-ctx-menu" [style.left.px]="contextMenuX" [style.top.px]="contextMenuY">
        <button class="call-ctx-item" (click)="onEnd(); closeContextMenu()">
          <mat-icon svgIcon="call_end"></mat-icon> End Call
        </button>
        <button class="call-ctx-item" (click)="toggleMute(); closeContextMenu()">
          <mat-icon [svgIcon]="localMuted ? 'mic' : 'mic_off'"></mat-icon> {{ localMuted ? 'Unmute' : 'Mute' }}
        </button>
        <button class="call-ctx-item" (click)="toggleDeafen(); closeContextMenu()">
          <mat-icon [svgIcon]="localDeafened ? 'hearing' : 'hearing_disabled'"></mat-icon> {{ localDeafened ? 'Undeafen' : 'Deafen' }}
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    /* ── FULL OVERLAY (outgoing / incoming) ── */
    .call-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .call-container {
      position: relative;
      background: linear-gradient(135deg, rgba(20, 20, 30, 0.95) 0%, rgba(10, 10, 20, 0.98) 100%);
      border: 1px solid var(--color-primary);
      padding: 40px 50px;
      border-radius: 4px;
      min-width: 360px;
      text-align: center;
      overflow: hidden;
    }

    .call-glow {
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: radial-gradient(circle at center, rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1) 0%, transparent 50%);
      animation: pulse 2s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.05); }
    }

    .call-scanline {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
      animation: scanline 2s linear infinite;
      opacity: 0.5;
    }

    @keyframes scanline { 0% { top: 0; } 100% { top: 100%; } }

    .call-content { position: relative; z-index: 1; }

    .call-spectrum {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      gap: 3px;
      margin-bottom: 20px;
      height: 32px;
    }

    .spectrum-bar {
      width: 3px;
      background: var(--color-primary);
      border-radius: 1.5px;
      animation: spectrumPulse 0.6s ease-in-out infinite alternate;
      box-shadow: 0 0 4px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.6);
    }

    .spectrum-bar:nth-child(1)  { height: 40%; animation-duration: 0.5s; }
    .spectrum-bar:nth-child(2)  { height: 70%; animation-duration: 0.4s; animation-delay: 0.05s; }
    .spectrum-bar:nth-child(3)  { height: 55%; animation-duration: 0.55s; animation-delay: 0.1s; }
    .spectrum-bar:nth-child(4)  { height: 90%; animation-duration: 0.35s; animation-delay: 0.15s; }
    .spectrum-bar:nth-child(5)  { height: 65%; animation-duration: 0.45s; animation-delay: 0.2s; }
    .spectrum-bar:nth-child(6)  { height: 100%; animation-duration: 0.3s; animation-delay: 0.08s; }
    .spectrum-bar:nth-child(7)  { height: 75%; animation-duration: 0.5s; animation-delay: 0.12s; }
    .spectrum-bar:nth-child(8)  { height: 50%; animation-duration: 0.42s; animation-delay: 0.18s; }
    .spectrum-bar:nth-child(9)  { height: 85%; animation-duration: 0.38s; animation-delay: 0.06s; }
    .spectrum-bar:nth-child(10) { height: 60%; animation-duration: 0.48s; animation-delay: 0.14s; }
    .spectrum-bar:nth-child(11) { height: 80%; animation-duration: 0.36s; animation-delay: 0.22s; }
    .spectrum-bar:nth-child(12) { height: 45%; animation-duration: 0.52s; animation-delay: 0.03s; }

    @keyframes spectrumPulse {
      0%   { transform: scaleY(0.3); opacity: 0.6; }
      100% { transform: scaleY(1);   opacity: 1; }
    }

    .call-label {
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--color-primary);
      margin-bottom: 24px;
      text-shadow: 0 0 10px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.5);
    }

    .call-dots span {
      animation: callDotBlink 1.4s infinite;
      opacity: 0;
    }

    .call-dots span:nth-child(1) { animation-delay: 0s; }
    .call-dots span:nth-child(2) { animation-delay: 0.2s; }
    .call-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes callDotBlink {
      0%, 20% { opacity: 0; }
      40%     { opacity: 1; }
      60%, 100% { opacity: 0; }
    }

    .call-avatar-wrap {
      position: relative;
      width: 100px; height: 100px;
      margin: 0 auto 20px;
    }

    .call-avatar {
      width: 100%; height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--color-primary);
    }

    .call-avatar-placeholder {
      width: 100%; height: 100%;
      border-radius: 50%;
      background: var(--bg-secondary);
      border: 2px solid var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .call-avatar-placeholder mat-icon {
      font-size: 48px; width: 48px; height: 48px;
      color: var(--color-primary);
    }

    .call-avatar-ring {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 2px solid var(--color-primary);
      animation: ringPulse 1.5s ease-in-out infinite;
    }

    @keyframes ringPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.5; }
    }

    .call-username {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 8px;
      text-shadow: 0 0 20px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
    }

    .call-vc-invite {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--color-primary);
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      padding: 4px 12px;
      border-radius: 4px;
      margin-bottom: 24px;
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
    }

    .call-vc-invite mat-icon { font-size: 14px; width: 14px; height: 14px; }

    .call-quick-replies {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .quick-reply-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-reply-btn mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--color-primary); }

    .quick-reply-btn:hover {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
      border-color: var(--color-primary);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
    }

    .call-actions { display: flex; gap: 16px; justify-content: center; }

    .call-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .call-btn mat-icon { font-size: 20px; width: 20px; height: 20px; }

    .call-btn-decline {
      background: rgba(255, 68, 68, 0.2);
      color: #ff4444;
      border: 1px solid #ff4444;
    }

    .call-btn-decline:hover {
      background: rgba(255, 68, 68, 0.3);
      box-shadow: 0 0 20px rgba(255, 68, 68, 0.3);
      transform: translateY(-2px);
    }

    .call-btn-accept {
      background: rgba(0, 255, 136, 0.2);
      color: #00ff88;
      border: 1px solid #00ff88;
    }

    .call-btn-accept:hover {
      background: rgba(0, 255, 136, 0.3);
      box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
      transform: translateY(-2px);
    }

    .call-corner {
      position: absolute;
      width: 20px; height: 20px;
      border-color: var(--color-primary);
      border-style: solid;
    }

    .call-corner-tl { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
    .call-corner-tr { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
    .call-corner-bl { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
    .call-corner-br { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; }

    /* ── COMPACT VIEW (active call, floating) ── */
    .call-compact {
      position: fixed;
      bottom: 16px;
      right: 16px;
      width: 280px;
      background: linear-gradient(135deg, rgba(16, 18, 28, 0.97) 0%, rgba(10, 12, 20, 0.98) 100%);
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.4);
      border-radius: 6px;
      overflow: hidden;
      z-index: 9000;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6), 0 0 1px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
      user-select: none;
      animation: compactIn 0.3s ease-out;
    }

    @keyframes compactIn {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .call-compact-glow {
      position: absolute;
      top: -20px; left: -20px;
      width: calc(100% + 40px); height: calc(100% + 40px);
      background: radial-gradient(circle at 50% 0%, rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.08) 0%, transparent 60%);
      pointer-events: none;
    }

    .call-compact-inner { position: relative; z-index: 1; }

    .call-compact-drag {
      cursor: grab;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.15);
    }

    .call-compact-drag:active { cursor: grabbing; }

    .call-compact-peer {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }

    .call-compact-avatar-wrap {
      position: relative;
      width: 36px; height: 36px;
      flex-shrink: 0;
    }

    .call-compact-avatar {
      width: 100%; height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid var(--color-primary);
    }

    .call-compact-avatar-placeholder {
      width: 100%; height: 100%;
      border-radius: 50%;
      background: var(--bg-secondary);
      border: 1.5px solid var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .call-compact-avatar-placeholder mat-icon {
      font-size: 18px; width: 18px; height: 18px;
      color: var(--color-primary);
    }

    .call-compact-avatar-ring {
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 1.5px solid var(--color-primary);
      animation: ringPulse 2s ease-in-out infinite;
    }

    .call-compact-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .call-compact-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .call-compact-status {
      font-size: 10px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .call-compact-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 6px 8px;
      justify-content: center;
    }

    .call-ctrl-btn {
      width: 30px; height: 30px;
      border: none;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      border-radius: 4px;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      padding: 0;
    }

    .call-ctrl-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }

    .call-ctrl-btn:hover {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
      color: var(--text-primary);
    }

    .call-ctrl-btn.active {
      background: rgba(255, 68, 68, 0.2);
      color: #ff6b6b;
    }

    .call-ctrl-end {
      background: rgba(255, 68, 68, 0.15) !important;
      color: #ff4444 !important;
    }

    .call-ctrl-end:hover {
      background: rgba(255, 68, 68, 0.3) !important;
      box-shadow: 0 0 8px rgba(255, 68, 68, 0.3);
    }

    .call-ctrl-expand {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.15);
      color: var(--color-primary);
    }

    .call-ctrl-expand:hover {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.25);
    }

    /* ── EXPANDED VIEW (replaces chat) ── */
    .call-expanded {
      position: relative;
      width: 100%;
      height: 100%;
      background: linear-gradient(160deg, rgba(12, 14, 22, 0.98) 0%, rgba(6, 8, 14, 0.99) 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      animation: expandedIn 0.3s ease-out;
    }

    @keyframes expandedIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }

    .call-expanded-glow {
      position: absolute;
      top: -30%; left: -30%;
      width: 160%; height: 160%;
      background: radial-gradient(circle at 50% 40%, rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.07) 0%, transparent 50%);
      pointer-events: none;
      animation: pulse 3s ease-in-out infinite;
    }

    .call-expanded-scanline {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
      animation: scanline 3s linear infinite;
      opacity: 0.3;
    }

    .call-expanded-header {
      position: absolute;
      top: 20px;
      left: 0; right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 1;
    }

    .call-expanded-title {
      font-size: 10px;
      letter-spacing: 3px;
      color: var(--color-primary);
      text-shadow: 0 0 10px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.4);
    }

    .call-expanded-duration {
      font-size: 12px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .call-expanded-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 1;
    }

    .call-expanded-avatar-wrap {
      position: relative;
      width: 140px; height: 140px;
      margin-bottom: 24px;
    }

    .call-expanded-avatar {
      width: 100%; height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--color-primary);
    }

    .call-expanded-avatar-placeholder {
      width: 100%; height: 100%;
      border-radius: 50%;
      background: var(--bg-secondary);
      border: 2px solid var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .call-expanded-avatar-placeholder mat-icon {
      font-size: 64px; width: 64px; height: 64px;
      color: var(--color-primary);
    }

    .call-expanded-avatar-ring {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 2px solid var(--color-primary);
      animation: ringPulse 2s ease-in-out infinite;
    }

    .call-expanded-avatar-glow {
      position: absolute;
      inset: -20px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.15) 0%, transparent 70%);
      animation: pulse 2.5s ease-in-out infinite;
      pointer-events: none;
    }

    .call-expanded-peer-name {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-primary);
      text-shadow: 0 0 24px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
    }

    .call-expanded-controls {
      display: flex;
      gap: 12px;
      margin-top: 36px;
      z-index: 1;
      flex-wrap: wrap;
      justify-content: center;
    }

    .call-ctrl-lg {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 14px 18px;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.08);
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s;
      min-width: 72px;
    }

    .call-ctrl-lg mat-icon { font-size: 22px; width: 22px; height: 22px; }

    .call-ctrl-lg span {
      font-size: 10px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .call-ctrl-lg:hover {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.15);
      border-color: var(--color-primary);
      color: var(--text-primary);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.15);
    }

    .call-ctrl-lg.active {
      background: rgba(255, 68, 68, 0.15);
      border-color: rgba(255, 68, 68, 0.4);
      color: #ff6b6b;
    }

    .call-ctrl-nudge:hover:not(:disabled) {
      background: rgba(255, 170, 0, 0.1);
      border-color: rgba(255, 170, 0, 0.4);
      color: #ffaa00;
      box-shadow: 0 4px 12px rgba(255, 170, 0, 0.1);
    }

    .call-ctrl-nudge:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .call-ctrl-end-lg {
      background: rgba(255, 68, 68, 0.12) !important;
      border-color: rgba(255, 68, 68, 0.3) !important;
      color: #ff4444 !important;
    }

    .call-ctrl-end-lg:hover {
      background: rgba(255, 68, 68, 0.25) !important;
      border-color: #ff4444 !important;
      box-shadow: 0 4px 16px rgba(255, 68, 68, 0.25) !important;
    }

    .call-expanded-volume {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 28px;
      z-index: 1;
    }

    .call-volume-icon {
      font-size: 18px; width: 18px; height: 18px;
      color: var(--text-secondary);
    }

    .call-volume-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 160px;
      height: 4px;
      border-radius: 2px;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
      outline: none;
      cursor: pointer;
    }

    .call-volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-primary);
      cursor: pointer;
      box-shadow: 0 0 6px rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.5);
    }

    .call-volume-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-primary);
      cursor: pointer;
      border: none;
    }

    .call-volume-slider:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .call-volume-label {
      font-size: 11px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      min-width: 32px;
    }

    .call-expanded-actions {
      position: absolute;
      bottom: 20px;
      z-index: 1;
    }

    .call-collapse-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.08);
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.2);
      border-radius: 4px;
      color: var(--text-secondary);
      font-size: 11px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s;
    }

    .call-collapse-btn mat-icon { font-size: 14px; width: 14px; height: 14px; }

    .call-collapse-btn:hover {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.15);
      border-color: var(--color-primary);
      color: var(--text-primary);
    }

    /* ── CONTEXT MENU ── */
    .call-ctx-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10000;
    }

    .call-ctx-menu {
      position: fixed;
      z-index: 10001;
      background: linear-gradient(135deg, rgba(18, 20, 30, 0.98) 0%, rgba(10, 12, 18, 0.99) 100%);
      border: 1px solid rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.3);
      border-radius: 4px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    .call-ctx-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 14px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      text-align: left;
    }

    .call-ctx-item mat-icon { font-size: 16px; width: 16px; height: 16px; }

    .call-ctx-item:hover {
      background: rgba(var(--color-primary-r), var(--color-primary-g), var(--color-primary-b), 0.1);
      color: var(--text-primary);
    }
  `]
})
export class CyberCallComponent implements OnInit, OnDestroy {
  @Output() expandedChange = new EventEmitter<boolean>();

  incomingCall: IncomingCall | null = null;
  outgoingCall: { calleeId: string; calleeName: string; callId: string } | null = null;
  activeCall: ActiveCall | null = null;
  quickReplies: QuickReply[] = QUICK_REPLIES;

  peerName = '';
  peerAvatar: string | null = null;

  expanded = false;
  compactX = 0;
  compactY = 0;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  localMuted = false;
  localDeafened = false;
  remoteVolume = 100;
  canNudge = true;

  callTimer = '00:00';
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  contextMenuOpen = false;
  contextMenuX = 0;
  contextMenuY = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private callService: CallService,
    private nudgeService: VoiceNudgeService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.compactX = window.innerWidth - 300;
    this.compactY = window.innerHeight - 120;

    this.subscriptions.push(
      this.callService.incomingCall$.subscribe(call => {
        this.incomingCall = call;
        this.updatePeerInfo();
        this.cdr.markForCheck();
      }),
      this.callService.outgoingCall$.subscribe(call => {
        this.outgoingCall = call;
        this.updatePeerInfo();
        this.cdr.markForCheck();
      }),
      this.callService.activeCall$.subscribe(call => {
        const wasActive = !!this.activeCall;
        this.activeCall = call;
        if (call) {
          this.startTimer();
          this.updatePeerInfo();
        } else {
          this.stopTimer();
          this.callTimer = '00:00';
          if (wasActive) {
            this.expanded = false;
            this.expandedChange.emit(false);
          }
        }
        this.cdr.markForCheck();
      })
    );

    this.nudgeService.onNudgeReceived = () => {};
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.stopTimer();
  }

  private updatePeerInfo(): void {
    if (this.activeCall) {
      this.peerName = this.activeCall.peerName;
      this.peerAvatar = this.activeCall.peerAvatar;
    } else if (this.outgoingCall) {
      this.peerName = this.outgoingCall.calleeName;
      this.peerAvatar = null;
    } else if (this.incomingCall) {
      this.peerName = this.incomingCall.callerName;
      this.peerAvatar = this.incomingCall.callerAvatar;
    }
  }

  private startTimer(): void {
    this.stopTimer();
    const start = this.activeCall?.startedAt || Date.now();
    const update = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      this.callTimer = `${mins}:${secs}`;
      this.cdr.markForCheck();
    };
    update();
    this.timerInterval = setInterval(update, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  expand(): void {
    this.expanded = true;
    this.expandedChange.emit(true);
    this.cdr.markForCheck();
  }

  collapse(): void {
    this.expanded = false;
    this.expandedChange.emit(false);
    this.cdr.markForCheck();
  }

  onAccept(): void {
    if (this.incomingCall) {
      this.callService.accept(this.incomingCall.callId);
    }
  }

  onDecline(): void {
    if (this.incomingCall) {
      this.callService.decline(this.incomingCall.callId);
    }
  }

  onCancel(): void {
    if (this.outgoingCall) {
      this.callService.end(this.outgoingCall.callId);
    }
  }

  onEnd(): void {
    if (this.activeCall) {
      this.callService.end(this.activeCall.callId);
    }
  }

  onQuickReply(replyId: string): void {
    if (!this.incomingCall) return;
    const messages: Record<string, string> = {
      busy: 'Busy right now, will ping you later.',
      later: 'Can you call me later? I\'m tied up.',
      '10min': 'Gimme 10 minutes, almost done with something.',
    };
    const message = messages[replyId] || 'Can\'t talk right now.';
    this.callService.sendQuickReply(this.incomingCall.callId, message);
  }

  toggleMute(): void {
    this.localMuted = !this.localMuted;
    this.cdr.markForCheck();
  }

  toggleDeafen(): void {
    this.localDeafened = !this.localDeafened;
    if (this.localDeafened) this.localMuted = true;
    this.cdr.markForCheck();
  }

  onNudge(): void {
    if (!this.activeCall || !this.canNudge) return;
    this.nudgeService.sendNudge(this.activeCall.peerId, this.activeCall.peerName);
    this.canNudge = false;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.canNudge = true;
      this.cdr.markForCheck();
    }, 5000);
  }

  onVolumeChange(event: Event): void {
    const val = (event.target as HTMLInputElement).valueAsNumber;
    this.remoteVolume = val;
    this.cdr.markForCheck();
  }

  onDragStart(event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.dragging = true;
    this.dragOffsetX = event.clientX - this.compactX;
    this.dragOffsetY = event.clientY - this.compactY;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.dragging) return;
    this.compactX = Math.max(0, Math.min(window.innerWidth - 280, event.clientX - this.dragOffsetX));
    this.compactY = Math.max(0, Math.min(window.innerHeight - 90, event.clientY - this.dragOffsetY));
    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.dragging = false;
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuOpen = true;
    this.cdr.markForCheck();
  }

  closeContextMenu(): void {
    this.contextMenuOpen = false;
    this.cdr.markForCheck();
  }
}
