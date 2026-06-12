import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { GgChannel, GgServer, DmConversation, FriendUser, GgServerMember } from '../../../services/chat.service';
import { ChatService } from '../../../services/chat.service';
import { CyberSelectComponent, CyberSelectOption } from '../../../components/cyber-select/cyber-select.component';
import { CyberDropdownComponent, DropdownItem } from '../../../components/cyber-dropdown/cyber-dropdown.component';
import { VoiceNudgeService } from '../../../services/voice-nudge.service';
import { VoiceService } from '../../../services/voice.service';

@Component({
  selector: 'app-channel-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, FormsModule, RouterModule, DragDropModule, CyberSelectComponent, CyberDropdownComponent],
  host: { style: 'display: contents' },
  template: `
    <aside class="gg-channels">
      @if (viewMode === 'create-server') {
        <div class="gg-channels-head">
          <span class="gg-channels-title">Create Server</span>
        </div>
        <div class="gg-channels-scroll">
        </div>
        <div class="gg-user-status-panel">
          <div class="gg-user-status-main" (click)="toggleProfileMenu()" style="cursor: pointer;">
            <div class="gg-user-avatar">
              <div class="gg-avatar-sk"></div>
              <img loading="lazy" decoding="async" [src]="userAvatar()" alt="" class="gg-user-img" (error)="onAvatarError($event); $event.target.previousElementSibling?.classList?.add('sk-err')" (load)="$event.target.previousElementSibling?.classList?.add('sk-hidden')" />
              <span
                class="gg-user-status-dot"
                [class.online]="currentStatus === 'online'"
                [class.away]="currentStatus === 'away'"
                [class.dnd]="currentStatus === 'dnd'"
                [class.invisible]="currentStatus === 'invisible'"
                title="Status: {{ currentStatus }}"
              ></span>
            </div>
            <div class="gg-user-status-copy">
              <span class="gg-user-name">{{ currentUser?.username ?? 'Unknown' }}</span>
              <span class="gg-user-status-text">{{ currentStatus }}</span>
            </div>
            <mat-icon class="gg-user-menu-arrow" [class.open]="profileMenuOpen" svgIcon="expand_more"></mat-icon>
          </div>

          @if (profileMenuOpen) {
            <div class="gg-profile-menu">
              <div class="gg-profile-menu-section">
                <span class="gg-profile-menu-label">Status</span>
                @for (s of statusOptions; track s.id) {
                  <button class="gg-profile-menu-item" [class.active]="currentStatus === s.id" (click)="setStatus.emit(s.id); profileMenuOpen = false">
                    <span class="gg-user-status-dot-sm" [style.background]="statusColor(s.id)"></span>
                    {{ s.label }}
                  </button>
                }
              </div>
              <div class="gg-profile-menu-divider"></div>
              <div class="gg-profile-menu-section">
                @if (isServerView) {
                  <a class="gg-profile-menu-item" [routerLink]="serverProfileLink" [queryParams]="{tab: 'profile'}" (click)="profileMenuOpen = false">
                    <mat-icon svgIcon="person"></mat-icon> Server Profile
                  </a>
                }
                @if (!isServerView) {
                  <a class="gg-profile-menu-item" routerLink="/profile" (click)="profileMenuOpen = false">
                    <mat-icon svgIcon="person"></mat-icon> Profile
                  </a>
                }
                <a class="gg-profile-menu-item" routerLink="/settings" (click)="profileMenuOpen = false">
                  <mat-icon svgIcon="settings"></mat-icon> Settings
                </a>
              </div>
            </div>
          }

          @if (showDevicePicker) {
            <div class="gg-voice-device-picker">
              <app-cyber-select
                [options]="inputDeviceOptions"
                [value]="selectedInputId"
                [openAbove]="true"
                icon="mic"
                label="Input Device"
                placeholder="Default Microphone"
                (valueChange)="onInputDeviceChange.emit($event)"
              ></app-cyber-select>
              <app-cyber-select
                [options]="outputDeviceOptions"
                [value]="selectedOutputId"
                [openAbove]="true"
                icon="volume_up"
                label="Output Device"
                placeholder="Default Speaker"
                (valueChange)="onOutputDeviceChange.emit($event)"
              ></app-cyber-select>
              <button
                type="button"
                class="gg-voice-control-btn gg-voice-ns-toggle"
                [class.active]="noiseSuppressionEnabled"
                (click)="onNoiseSuppressionChange.emit(!noiseSuppressionEnabled)"
                [title]="noiseSuppressionEnabled ? 'Noise Suppression: ON' : 'Noise Suppression: OFF'"
              >
                <mat-icon [svgIcon]="noiseSuppressionEnabled ? 'auto_fix_high' : 'auto_fix_off'"></mat-icon>
                <span class="gg-voice-ns-label">Noise Suppression</span>
              </button>
            </div>
          }

          <div class="gg-user-status-controls">
            <button type="button" class="gg-voice-control-btn" [class.active]="voiceMuted" (click)="toggleVoiceMute.emit()" title="{{ voiceMuted ? 'Unmute' : 'Mute' }}">
              <mat-icon [svgIcon]="voiceMuted ? 'mic_off' : 'mic'"></mat-icon>
            </button>
            <button type="button" class="gg-voice-control-btn" [class.active]="voiceDeafened" (click)="toggleVoiceDeaf.emit()" title="{{ voiceDeafened ? 'Undeafen' : 'Deafen' }}">
              <mat-icon [svgIcon]="voiceDeafened ? 'headset_off' : 'headset'"></mat-icon>
            </button>
            @if (voiceConnected) {
              <button type="button" class="gg-voice-control-btn" [class.active]="showDevicePicker" (click)="toggleDevicePicker.emit()" title="Audio Settings">
                <mat-icon svgIcon="settings"></mat-icon>
              </button>
              <button type="button" class="gg-voice-control-btn gg-voice-disconnect-btn" (click)="leaveVoice.emit()" title="Disconnect">
                <mat-icon svgIcon="phone_off"></mat-icon>
              </button>
            }
          </div>
        </div>
      } @else if (viewMode === 'dm' || viewMode === 'friends' || viewMode === 'trading' || viewMode === 'trading-inline' || viewMode === 'gift-inline') {
        <div class="gg-channels-head">
          <span class="gg-channels-title">Direct Messages</span>
        </div>

        <div class="gg-channels-scroll">
          <div class="gg-dm-section-label">Friends</div>

          <div class="gg-channel gg-friends-btn" [class.active]="viewMode === 'friends'" (click)="openFriendsView.emit()">
            <mat-icon class="gg-ch-icon" svgIcon="people"></mat-icon>
            <span class="gg-ch-name">Friends</span>
            @if (pendingRequests.length > 0) {
              <span class="gg-pending-badge">{{ pendingRequests.length }}</span>
            }
          </div>

          <div class="gg-channel gg-trading-btn" [class.active]="viewMode === 'trading' || viewMode === 'trading-inline' || viewMode === 'gift-inline'" (click)="openTradingView.emit()">
            <mat-icon class="gg-ch-icon" svgIcon="style"></mat-icon>
            <span class="gg-ch-name">Trade</span>
          </div>

          @if (dmLoading) {
            <div class="gg-skeleton-list">
              @for (_ of [1,2,3]; track _) {
                <div class="gg-sk-channel">
                  <div class="gg-sk-icon gg-sk-icon-lg"></div>
                  <div class="gg-sk-line gg-sk-w60"></div>
                </div>
              }
            </div>
          } @else if (dmConversations.length > 0) {
            <div class="gg-dm-section-label">Messages</div>
            @for (conv of dmConversations; track conv.id) {
              <div
                class="gg-channel"
                [class.active]="selectedDm?.id === conv.id"
                (click)="selectDm.emit(conv)"
              >
                <div class="gg-dm-avatar-sm">
                  <div class="gg-avatar-sk"></div>
                  <img loading="lazy" decoding="async" [src]="resolveAvatar(conv, 'otherAvatar')" alt="" class="gg-dm-avatar-img-sm" (error)="onAvatarError($event); $event.target.previousElementSibling?.classList?.add('sk-err')" (load)="$event.target.previousElementSibling?.classList?.add('sk-hidden')" />
                  <span class="gg-user-status-dot"
                    [class.online]="dmStatus(conv.otherUserId) === 'online'"
                    [class.away]="dmStatus(conv.otherUserId) === 'away'"
                    [class.dnd]="dmStatus(conv.otherUserId) === 'dnd'"
                    [class.invisible]="dmStatus(conv.otherUserId) === 'invisible'"
                  ></span>
                </div>
                <span class="gg-ch-name">{{ conv.otherUsername }}</span>
              </div>
            }
          } @else {
            <div class="gg-dm-empty">No conversations yet</div>
          }
        </div>

        <div class="gg-user-status-panel">
          <div class="gg-user-status-main" (click)="toggleProfileMenu()" style="cursor: pointer;">
            <div class="gg-user-avatar">
              <div class="gg-avatar-sk"></div>
              <img loading="lazy" decoding="async" [src]="userAvatar()" alt="" class="gg-user-img" (error)="onAvatarError($event); $event.target.previousElementSibling?.classList?.add('sk-err')" (load)="$event.target.previousElementSibling?.classList?.add('sk-hidden')" />
              <span
                class="gg-user-status-dot"
                [class.online]="currentStatus === 'online'"
                [class.away]="currentStatus === 'away'"
                [class.dnd]="currentStatus === 'dnd'"
                [class.invisible]="currentStatus === 'invisible'"
                title="Status: {{ currentStatus }}"
              ></span>
            </div>
            <div class="gg-user-status-copy">
              <span class="gg-user-name">{{ currentUser?.username ?? 'Unknown' }}</span>
              <span class="gg-user-status-text">{{ currentStatus }}</span>
            </div>
            <mat-icon class="gg-user-menu-arrow" [class.open]="profileMenuOpen" svgIcon="expand_more"></mat-icon>
          </div>

          @if (profileMenuOpen) {
            <div class="gg-profile-menu">
              <div class="gg-profile-menu-section">
                <span class="gg-profile-menu-label">Status</span>
                @for (s of statusOptions; track s.id) {
                  <button class="gg-profile-menu-item" [class.active]="currentStatus === s.id" (click)="setStatus.emit(s.id); profileMenuOpen = false">
                    <span class="gg-user-status-dot-sm" [style.background]="statusColor(s.id)"></span>
                    {{ s.label }}
                  </button>
                }
              </div>
              <div class="gg-profile-menu-divider"></div>
              <div class="gg-profile-menu-section">
                @if (isServerView) {
                  <a class="gg-profile-menu-item" [routerLink]="serverProfileLink" [queryParams]="{tab: 'profile'}" (click)="profileMenuOpen = false">
                    <mat-icon svgIcon="person"></mat-icon> Server Profile
                  </a>
                }
                @if (!isServerView) {
                  <a class="gg-profile-menu-item" routerLink="/profile" (click)="profileMenuOpen = false">
                    <mat-icon svgIcon="person"></mat-icon> Profile
                  </a>
                }
                <a class="gg-profile-menu-item" routerLink="/settings" (click)="profileMenuOpen = false">
                  <mat-icon svgIcon="settings"></mat-icon> Settings
                </a>
              </div>
            </div>
          }

          @if (showDevicePicker) {
            <div class="gg-voice-device-picker">
              <app-cyber-select
                [options]="inputDeviceOptions"
                [value]="selectedInputId"
                [openAbove]="true"
                icon="mic"
                label="Input Device"
                placeholder="Default Microphone"
                (valueChange)="onInputDeviceChange.emit($event)"
              ></app-cyber-select>
              <app-cyber-select
                [options]="outputDeviceOptions"
                [value]="selectedOutputId"
                [openAbove]="true"
                icon="volume_up"
                label="Output Device"
                placeholder="Default Speaker"
                (valueChange)="onOutputDeviceChange.emit($event)"
              ></app-cyber-select>
              <button
                type="button"
                class="gg-voice-control-btn gg-voice-ns-toggle"
                [class.active]="noiseSuppressionEnabled"
                (click)="onNoiseSuppressionChange.emit(!noiseSuppressionEnabled)"
                [title]="noiseSuppressionEnabled ? 'Noise Suppression: ON' : 'Noise Suppression: OFF'"
              >
                <mat-icon [svgIcon]="noiseSuppressionEnabled ? 'auto_fix_high' : 'auto_fix_off'"></mat-icon>
                <span class="gg-voice-ns-label">Noise Suppression</span>
              </button>
            </div>
          }

          <div class="gg-user-status-controls">
            <button type="button" class="gg-voice-control-btn" [class.active]="voiceMuted" (click)="toggleVoiceMute.emit()" title="{{ voiceMuted ? 'Unmute' : 'Mute' }}">
              <mat-icon [svgIcon]="voiceMuted ? 'mic_off' : 'mic'"></mat-icon>
            </button>
            <button type="button" class="gg-voice-control-btn" [class.active]="voiceDeafened" (click)="toggleVoiceDeaf.emit()" title="{{ voiceDeafened ? 'Undeafen' : 'Deafen' }}">
              <mat-icon [svgIcon]="voiceDeafened ? 'headset_off' : 'headset'"></mat-icon>
            </button>
            @if (voiceConnected) {
              <button type="button" class="gg-voice-control-btn" [class.active]="showDevicePicker" (click)="toggleDevicePicker.emit()" title="Audio Settings">
                <mat-icon svgIcon="settings"></mat-icon>
              </button>
              <button type="button" class="gg-voice-control-btn gg-voice-disconnect-btn" (click)="leaveVoice.emit()" title="Disconnect">
                <mat-icon svgIcon="phone_off"></mat-icon>
              </button>
            }
          </div>
        </div>
      } @else if (selectedServer) {
        <div class="gg-channels-head">
          <span class="gg-channels-title">{{ selectedServer.name }}</span>
          <div class="gg-server-dropdown-container">
            <button class="gg-ch-actions" (click)="toggleServerDropdown()" title="Server Menu">
              <mat-icon svgIcon="expand_more"></mat-icon>
            </button>
            <app-cyber-dropdown
              [items]="serverDropdownItems"
              [isOpen]="serverDropdownOpen"
              (itemSelect)="onServerDropdownSelect($event)"
            ></app-cyber-dropdown>
          </div>
        </div>

        <div class="gg-channels-scroll">
          @if (channelLoading) {
            <div class="gg-skeleton-list">
              @for (_ of [1,2,3,4,5]; track _) {
                <div class="gg-sk-channel">
                  <div class="gg-sk-icon"></div>
                  <div class="gg-sk-line gg-sk-w60"></div>
                </div>
              }
            </div>
          } @else {
              @if (canManageChannels) {
                <div cdkDropList [id]="'sidebar-categories'" [cdkDropListData]="categoryOrder"
                  (cdkDropListDropped)="onCategoryDrop($event)">
                  @for (cat of channelCategories; track cat.name || 'default') {
                    @if (cat.name) {
                      <div cdkDrag [cdkDragData]="cat" class="gg-category-wrap">
                        <div class="gg-category-header-row">
                          <div class="gg-cat-drag-handle" cdkDragHandle>
                            <mat-icon svgIcon="drag_indicator"></mat-icon>
                          </div>
                          @if (editingCategoryOriginal === cat.name) {
                            <input class="gg-category-input" type="text"
                              [value]="editingCategoryName"
                              (input)="editingCategoryName = $any($event.target).value"
                              (keydown.enter)="saveCategoryEdit()"
                              (keydown.escape)="cancelCategoryEdit()"
                              (blur)="saveCategoryEdit()" />
                          } @else {
                            <span class="gg-category-header" (dblclick)="startCategoryEdit(cat.name)">{{ cat.name }}</span>
                          }
                        </div>
                        <div cdkDropList [id]="'sidebar-cat-' + cat.name"
                          [cdkDropListData]="cat.channels"
                          [cdkDropListConnectedTo]="sidebarDropListIds"
                          (cdkDropListDropped)="onSidebarChannelDrop($event, cat.name)">
                          @for (ch of cat.channels; track ch.id) {
                            <div class="gg-channel-wrap" cdkDrag>
                              <div
                                class="gg-channel"
                                [class.active]="selectedChannel?.id === ch.id"
                                (click)="selectChannel.emit(ch)"
                              >
                                <mat-icon class="gg-ch-icon" [svgIcon]="isChannelPrivate(ch) ? 'lock' : channelIcon(ch.type)"></mat-icon>
                                <span class="gg-ch-name">{{ ch.name }}</span>
                                @if (ch.type === 'voice' && voiceChannelUsers(chId(ch)).length > 0) {
                                  <span class="gg-ch-voice-count">{{ voiceChannelUsers(chId(ch)).length }}</span>
                                }
                                <button class="gg-ch-settings" (click)="openChannelSettings.emit(ch); $event.stopPropagation()" title="Channel Settings">
                                  <mat-icon svgIcon="settings"></mat-icon>
                                </button>
                                <button class="gg-ch-delete" (click)="deleteChannel.emit(ch); $event.stopPropagation()" title="Delete">
                                  <mat-icon svgIcon="close"></mat-icon>
                                </button>
                              </div>
                              @if (ch.type === 'voice' && voiceChannelUsers(chId(ch)).length > 0) {
                                <div class="gg-voice-under-users">
                                  @for (vu of voiceChannelUsers(chId(ch)); track vu.userId) {
                                    <div class="gg-voice-under-user" [style.--user-accent]="getUserThemeColor(vu.userId)" [class.speaking]="voiceMemberSpeaking(vu.userId)" [class.nudged]="nudgeService.isRecentlyNudged(vu.userId)" (contextmenu)="voiceContextMenuRequest.emit({ event: $event, vm: vu })">
                                      <div class="gg-voice-under-avatar">
                                        @if (voiceMemberAvatar(vu.userId)) {
                                          <img loading="lazy" decoding="async" [src]="voiceMemberAvatar(vu.userId)!" alt="" />
                                        } @else {
                                          <span>{{ voiceMemberName(vu.userId)[0] }}</span>
                                        }
                                      </div>
                                      <span class="gg-voice-under-name">{{ voiceMemberName(vu.userId) }}</span>
                                      @if (vu.muted) {
                                        <mat-icon class="gg-voice-under-status muted" svgIcon="mic_off"></mat-icon>
                                      }
                                      @if (vu.deafened) {
                                        <mat-icon class="gg-voice-under-status deafened" svgIcon="headset_off"></mat-icon>
                                      }
                                    </div>
                                  }
                                </div>
                              }
                            </div>
                          }
                        </div>
                        <div *cdkDragPlaceholder class="gg-cat-placeholder"></div>
                      </div>
                    }
                  }
                </div>
              } @else {
                @for (cat of channelCategories; track cat.name || 'default') {
                  @if (cat.name) {
                    <div class="gg-category-header gg-category-standalone">{{ cat.name }}</div>
                  }
                  @for (ch of cat.channels; track ch.id) {
                    <div class="gg-channel-wrap">
                      <div
                        class="gg-channel"
                        [class.active]="selectedChannel?.id === ch.id"
                        (click)="selectChannel.emit(ch)"
                      >
                        <mat-icon class="gg-ch-icon" [svgIcon]="isChannelPrivate(ch) ? 'lock' : channelIcon(ch.type)"></mat-icon>
                        <span class="gg-ch-name">{{ ch.name }}</span>
                        @if (ch.type === 'voice' && voiceChannelUsers(chId(ch)).length > 0) {
                          <span class="gg-ch-voice-count">{{ voiceChannelUsers(chId(ch)).length }}</span>
                        }
                        <button class="gg-ch-settings" (click)="openChannelSettings.emit(ch); $event.stopPropagation()" title="Channel Settings">
                          <mat-icon svgIcon="settings"></mat-icon>
                        </button>
                        <button class="gg-ch-delete" (click)="deleteChannel.emit(ch); $event.stopPropagation()" title="Delete">
                          <mat-icon svgIcon="close"></mat-icon>
                        </button>
                      </div>
                      @if (ch.type === 'voice' && voiceChannelUsers(chId(ch)).length > 0) {
                        <div class="gg-voice-under-users">
                          @for (vu of voiceChannelUsers(chId(ch)); track vu.userId) {
                            <div class="gg-voice-under-user" [style.--user-accent]="getUserThemeColor(vu.userId)" [class.speaking]="voiceMemberSpeaking(vu.userId)" [class.nudged]="nudgeService.isRecentlyNudged(vu.userId)" (contextmenu)="voiceContextMenuRequest.emit({ event: $event, vm: vu })">
                              <div class="gg-voice-under-avatar">
                                @if (voiceMemberAvatar(vu.userId)) {
                                  <img loading="lazy" decoding="async" [src]="voiceMemberAvatar(vu.userId)!" alt="" />
                                } @else {
                                  <span>{{ voiceMemberName(vu.userId)[0] }}</span>
                                }
                              </div>
                              <span class="gg-voice-under-name">{{ voiceMemberName(vu.userId) }}</span>
                              @if (vu.muted) {
                                <mat-icon class="gg-voice-under-status muted" svgIcon="mic_off"></mat-icon>
                              }
                              @if (vu.deafened) {
                                <mat-icon class="gg-voice-under-status deafened" svgIcon="headset_off"></mat-icon>
                              }
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                }
              }
          }

          <div class="gg-channel gg-channel-add" (click)="openCreateChannel.emit()">
            <mat-icon class="gg-ch-icon" svgIcon="add"></mat-icon>
            <span class="gg-ch-name">Add Channel</span>
          </div>
        </div>

        <div class="gg-user-status-panel">
          <div class="gg-user-status-main" (click)="toggleProfileMenu()" style="cursor: pointer;">
            <div class="gg-user-avatar">
              <div class="gg-avatar-sk"></div>
              <img loading="lazy" decoding="async" [src]="userAvatar()" alt="" class="gg-user-img" (error)="onAvatarError($event); $event.target.previousElementSibling?.classList?.add('sk-err')" (load)="$event.target.previousElementSibling?.classList?.add('sk-hidden')" />
              <span
                class="gg-user-status-dot"
                [class.online]="currentStatus === 'online'"
                [class.away]="currentStatus === 'away'"
                [class.dnd]="currentStatus === 'dnd'"
                [class.invisible]="currentStatus === 'invisible'"
                title="Status: {{ currentStatus }}"
              ></span>
            </div>
            <div class="gg-user-status-copy">
              <span class="gg-user-name">{{ currentUser?.username ?? 'You' }}</span>
              <span class="gg-user-status-text">{{ currentStatus }}</span>
            </div>
            <mat-icon class="gg-user-menu-arrow" [class.open]="profileMenuOpen" svgIcon="expand_more"></mat-icon>
          </div>

          @if (profileMenuOpen) {
            <div class="gg-profile-menu">
              <div class="gg-profile-menu-section">
                <span class="gg-profile-menu-label">Status</span>
                @for (s of statusOptions; track s.id) {
                  <button class="gg-profile-menu-item" [class.active]="currentStatus === s.id" (click)="setStatus.emit(s.id); profileMenuOpen = false">
                    <span class="gg-user-status-dot-sm" [style.background]="statusColor(s.id)"></span>
                    {{ s.label }}
                  </button>
                }
              </div>
              <div class="gg-profile-menu-divider"></div>
              <div class="gg-profile-menu-section">
                @if (isServerView) {
                  <a class="gg-profile-menu-item" [routerLink]="serverProfileLink" [queryParams]="{tab: 'profile'}" (click)="profileMenuOpen = false">
                    <mat-icon svgIcon="person"></mat-icon> Server Profile
                  </a>
                }
                @if (!isServerView) {
                  <a class="gg-profile-menu-item" routerLink="/profile" (click)="profileMenuOpen = false">
                    <mat-icon svgIcon="person"></mat-icon> Profile
                  </a>
                }
                <a class="gg-profile-menu-item" routerLink="/settings" (click)="profileMenuOpen = false">
                  <mat-icon svgIcon="settings"></mat-icon> Settings
                </a>
              </div>
            </div>
          }

          <!-- Device picker (Discord-style) - positioned ABOVE the control buttons, UNDER the profile dropdown -->
          @if (showDevicePicker) {
            <div class="gg-voice-device-picker">
              <app-cyber-select
                [options]="inputDeviceOptions"
                [value]="selectedInputId"
                [openAbove]="true"
                icon="mic"
                label="Input Device"
                placeholder="Default Microphone"
                (valueChange)="onInputDeviceChange.emit($event)"
              ></app-cyber-select>
              <app-cyber-select
                [options]="outputDeviceOptions"
                [value]="selectedOutputId"
                [openAbove]="true"
                icon="volume_up"
                label="Output Device"
                placeholder="Default Speaker"
                (valueChange)="onOutputDeviceChange.emit($event)"
              ></app-cyber-select>
              <button
                type="button"
                class="gg-voice-control-btn gg-voice-ns-toggle"
                [class.active]="noiseSuppressionEnabled"
                (click)="onNoiseSuppressionChange.emit(!noiseSuppressionEnabled)"
                [title]="noiseSuppressionEnabled ? 'Noise Suppression: ON' : 'Noise Suppression: OFF'"
              >
                <mat-icon [svgIcon]="noiseSuppressionEnabled ? 'auto_fix_high' : 'auto_fix_off'"></mat-icon>
                <span class="gg-voice-ns-label">Noise Suppression</span>
              </button>
            </div>
          }

          <div class="gg-user-status-controls">
            <button type="button" class="gg-voice-control-btn" [class.active]="voiceMuted" (click)="toggleVoiceMute.emit()" title="{{ voiceMuted ? 'Unmute' : 'Mute' }}">
              <mat-icon [svgIcon]="voiceMuted ? 'mic_off' : 'mic'"></mat-icon>
            </button>
            <button type="button" class="gg-voice-control-btn" [class.active]="voiceDeafened" (click)="toggleVoiceDeaf.emit()" title="{{ voiceDeafened ? 'Undeafen' : 'Deafen' }}">
              <mat-icon [svgIcon]="voiceDeafened ? 'headset_off' : 'headset'"></mat-icon>
            </button>
            @if (voiceConnected) {
              <button type="button" class="gg-voice-control-btn" [class.active]="showDevicePicker" (click)="toggleDevicePicker.emit()" title="Audio Settings">
                <mat-icon svgIcon="settings"></mat-icon>
              </button>
              <button type="button" class="gg-voice-control-btn gg-voice-disconnect-btn" (click)="leaveVoice.emit()" title="Disconnect">
                <mat-icon svgIcon="phone_off"></mat-icon>
              </button>
            }
          </div>
        </div>
      } @else {
        <div class="gg-no-server">
          @if (serverLoading) {
            <div class="gg-skeleton-list">
              @for (_ of [1,2]; track _) {
                <div class="gg-sk-server">
                  <div class="gg-sk-icon gg-sk-icon-lg"></div>
                  <div class="gg-sk-line gg-sk-w40"></div>
                </div>
              }
            </div>
          } @else {
            <mat-icon svgIcon="forum"></mat-icon>
            <p>a server to start chatting</p>
            <button class="gg-cyber-btn" (click)="openCreateServer.emit()">Create Server</button>
          }
        </div>
      }
    </aside>
  `,
  styleUrls: ['../gg-chat.component.scss'],
})
export class ChannelListComponent {
  @Input() viewMode!: string;
  @Input() selectedServer: GgServer | null = null;
  @Input() servers: GgServer[] = [];
  @Input() serverLoading = false;
  @Input() channels: GgChannel[] = [];
  @Input() selectedChannel: GgChannel | null = null;
  @Input() channelLoading = false;
  @Input() dmConversations: DmConversation[] = [];
  @Input() dmLoading = false;
  @Input() selectedDm: DmConversation | null = null;
  @Input() pendingRequests: FriendUser[] = [];
  @Input() profileMenuOpen = false;
  @Input() currentStatus = 'online';
  @Input() currentUser: any = null;
  @Input() memberStatuses: Record<string, string> = {};
  @Input() voiceConnected = false;
  @Input() voiceMuted = false;
  @Input() voiceDeafened = false;
  @Input() voiceChannelId: string | null = null;
  @Input() voiceMembers: { userId: string; muted: boolean; deafened: boolean }[] = [];
  @Input() allVoiceChannels: { channelId: string; users: { userId: string; muted: boolean; deafened: boolean; speaking: boolean }[] }[] = [];
  @Input() members: GgServerMember[] = [];
  @Input() showDevicePicker = false;
  @Input() audioInputDevices: MediaDeviceInfo[] = [];
  @Input() audioOutputDevices: MediaDeviceInfo[] = [];
  @Input() selectedInputId = 'default';
  @Input() selectedOutputId = 'default';
  @Input() noiseSuppressionEnabled = true;
  @Input() speakingUsers: Set<string> = new Set<string>();
  @Input() serverDropdownOpen = false;

  @Output() selectServer = new EventEmitter<GgServer>();
  @Output() goToDms = new EventEmitter<void>();
  @Output() openCreateServer = new EventEmitter<void>();
  @Output() selectChannel = new EventEmitter<GgChannel>();
  @Output() openCreateChannel = new EventEmitter<void>();
  @Output() deleteChannel = new EventEmitter<GgChannel>();
  @Output() selectDm = new EventEmitter<DmConversation>();
  @Output() openFriendsView = new EventEmitter<void>();
  @Output() openTradingView = new EventEmitter<void>();
  @Output() openInviteLinks = new EventEmitter<void>();
  @Output() setStatus = new EventEmitter<string>();
  @Output() toggleVoiceMute = new EventEmitter<void>();
  @Output() toggleVoiceDeaf = new EventEmitter<void>();
  @Output() toggleVoice = new EventEmitter<GgChannel>();
  @Output() leaveVoice = new EventEmitter<void>();
  @Output() toggleDevicePicker = new EventEmitter<void>();
  @Output() onInputDeviceChange = new EventEmitter<string>();
  @Output() onOutputDeviceChange = new EventEmitter<string>();
  @Output() onNoiseSuppressionChange = new EventEmitter<boolean>();
  @Output() profileMenuOpenChange = new EventEmitter<boolean>();
  @Output() serverDropdownOpenChange = new EventEmitter<boolean>();
  @Output() openChannelSettings = new EventEmitter<GgChannel>();
  @Output() voiceContextMenuRequest = new EventEmitter<{ event: MouseEvent; vm: any }>();
  @Output() updateCategory = new EventEmitter<{ oldName: string; newName: string }>();

  @Input() categories: { id: number; name: string; sort_order: number }[] = [];
  @Input() canManageChannels = false;

  editingCategoryName: string | null = null;
  editingCategoryOriginal: string | null = null;

  get isServerView(): boolean {
    return this.viewMode === 'server' && !!this.selectedServer;
  }

  get serverProfileLink(): any[] {
    return this.selectedServer ? ['/gg-chat/server', this.selectedServer.id, 'settings'] : [];
  }

  constructor(
    public readonly nudgeService: VoiceNudgeService,
    private readonly voiceService: VoiceService,
    private readonly chatService: ChatService,
  ) {}

  readonly statusOptions = [
    { id: 'online', label: 'Online', icon: '●' },
    { id: 'away', label: 'Away', icon: '●' },
    { id: 'dnd', label: 'Do Not Disturb', icon: '●' },
    { id: 'invisible', label: 'Invisible', icon: '●' },
  ];

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
    this.profileMenuOpenChange.emit(this.profileMenuOpen);
  }

  toggleServerDropdown(): void {
    this.serverDropdownOpen = !this.serverDropdownOpen;
    this.serverDropdownOpenChange.emit(this.serverDropdownOpen);
  }

  closeServerDropdown(): void {
    this.serverDropdownOpen = false;
    this.serverDropdownOpenChange.emit(false);
  }

  onInviteLinks(): void {
    this.openInviteLinks.emit();
    this.closeServerDropdown();
  }

  get serverDropdownItems(): DropdownItem[] {
    return [
      { label: 'Invite', icon: 'link', action: () => this.onInviteLinks() },
      { label: 'Settings', icon: 'settings', link: `/gg-chat/server/${this.selectedServer?.id}/settings` },
    ];
  }

  onServerDropdownSelect(item: DropdownItem): void {
    this.closeServerDropdown();
  }

  isChannelPrivate(channel: GgChannel): boolean {
    return (channel.allowed_roles?.length ?? 0) > 0;
  }

  channelIcon(type: string): string {
    return type === 'voice' ? 'volume_up' : 'tag';
  }

  chId(ch: GgChannel): string {
    return String(ch.id);
  }

  voiceChannelUsers(channelId: string): { userId: string; muted: boolean; deafened: boolean }[] {
    if (this.voiceChannelId === channelId && this.voiceConnected) {
      return this.voiceMembers;
    }
    const remote = this.allVoiceChannels.find(c => c.channelId === channelId);
    if (remote) {
      return remote.users.map(u => ({ userId: u.userId, muted: u.muted, deafened: u.deafened }));
    }
    return [];
  }

  get inputDeviceOptions(): CyberSelectOption[] {
    if (this.audioInputDevices.length === 0) {
      return [{ value: 'default', label: 'Default Microphone' }];
    }
    return this.audioInputDevices.map((d, i) => ({
      value: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
    }));
  }

  get outputDeviceOptions(): CyberSelectOption[] {
    if (this.audioOutputDevices.length === 0) {
      return [{ value: 'default', label: 'Default Speaker' }];
    }
    return this.audioOutputDevices.map((d, i) => ({
      value: d.deviceId,
      label: d.label || `Speaker ${i + 1}`,
    }));
  }

  voiceMemberName(userId: string): string {
    const member = this.members.find(m => m.user_id === userId);
    return member?.username ?? userId.slice(0, 8);
  }

  voiceMemberAvatar(userId: string): string | null {
    const member = this.members.find(m => m.user_id === userId);
    return member?.avatar_url ?? null;
  }

  voiceMemberSpeaking(userId: string): boolean {
    return this.speakingUsers.has(userId);
  }

  getUserThemeColor(userId: string): string {
    return this.voiceService.getUserThemeColor(userId);
  }

  dmStatus(otherUserId: string): string {
    return this.memberStatuses[otherUserId] ?? 'invisible';
  }

  get channelCategories(): { name: string; channels: GgChannel[] }[] {
    const catOrder = new Map<string, number>();
    for (const c of this.categories) catOrder.set(c.name, c.sort_order ?? 0);

    const cats = new Map<string, GgChannel[]>();
    for (const ch of this.channels) {
      const cat = (ch as any).category || '';
      if (!cat) continue;
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(ch);
    }
    const result: { name: string; channels: GgChannel[] }[] = [];
    for (const [name, channels] of cats) {
      if (channels.length > 0) result.push({ name, channels });
    }
    result.sort((a, b) => (catOrder.get(a.name) ?? 0) - (catOrder.get(b.name) ?? 0));
    return result;
  }

  startCategoryEdit(name: string): void {
    this.editingCategoryOriginal = name;
    this.editingCategoryName = name;
  }

  saveCategoryEdit(): void {
    const oldName = this.editingCategoryOriginal;
    const newName = (this.editingCategoryName ?? '').trim();
    if (oldName !== null && newName && newName !== oldName) {
      this.updateCategory.emit({ oldName, newName });
    }
    this.editingCategoryOriginal = null;
    this.editingCategoryName = null;
  }

  cancelCategoryEdit(): void {
    this.editingCategoryOriginal = null;
    this.editingCategoryName = null;
  }

  // Category reorder in sidebar
  get categoryOrder(): { id: number; name: string; sort_order: number }[] {
    return [...this.categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  onCategoryDrop(event: CdkDragDrop<any[]>): void {
    moveItemInArray(this.categories, event.previousIndex, event.currentIndex);
    const orderedIds = this.categories.map(c => c.id);
    this.chatService.reorderCategories(this.selectedServer?.id ?? 0, orderedIds).subscribe();
  }

  // Channel reorder within / between categories in sidebar
  get sidebarUncategorizedChannels(): GgChannel[] {
    return this.channels.filter(ch => !(ch as any).category);
  }

  getSidebarCategoryChannels(catName: string): GgChannel[] {
    return this.channels.filter(ch => (ch as any).category === catName);
  }

  get sidebarDropListIds(): string[] {
    const ids = ['sidebar-uncategorized'];
    for (const cat of this.categories) ids.push('sidebar-cat-' + cat.name);
    return ids;
  }

  onSidebarChannelDrop(event: CdkDragDrop<any[]>, targetCategory: string): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const ch = event.previousContainer.data[event.previousIndex];
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      (ch as any).category = targetCategory;
      this.chatService.moveChannelToCategory(ch.id, targetCategory).subscribe();
    }
  }

  statusColor(statusId?: string): string {
    const colors: Record<string, string> = {
      online: '#00ff88', away: '#ffd700', dnd: '#ff5f6d', invisible: '#888',
    };
    return colors[statusId ?? this.currentStatus] || '#888';
  }

  userAvatar(): string {
    return this.currentUser?.avatar ?? this.currentUser?.avatar_url ?? '';
  }

  private genderAvatar(gender?: string): string {
    const g = gender?.toLowerCase();
    if (g === 'male') return '/assets/avatars/male.webp';
    if (g === 'female') return '/assets/avatars/female.webp';
    return '/assets/avatars/unknown.webp';
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) img.src = this.genderAvatar(this.currentUser?.gender);
  }

  resolveAvatar(user: any, ...keys: string[]): string {
    if (!user) return this.genderAvatar(this.currentUser?.gender);
    for (const key of keys) {
      if (user[key]) {
        const url = user[key].includes('qpdpzookcfrylxnrqkwo.supabase.co')
          ? user[key].replace('qpdpzookcfrylxnrqkwo.supabase.co', 'lgesluubuaikmaigwwxq.supabase.co')
          : user[key];
        return url;
      }
    }
    return this.genderAvatar(user.gender);
  }
}

