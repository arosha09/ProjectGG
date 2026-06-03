
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GgServer } from '../../../services/chat.service';

@Component({
  selector: 'app-server-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <aside class="gg-servers">
      <div class="gg-servers-scroll">
        <div
          class="gg-server-icon gg-dm-icon"
          [class.active]="viewMode === 'dm'"
          (click)="goToDms.emit()"
          title="Direct Messages"
        >
          <mat-icon class="gg-dm-svg" svgIcon="chat"></mat-icon>
        </div>

        @if (servers.length > 0) {
          <div class="gg-server-divider"></div>

          @for (s of servers; track s.id) {
            <div
              class="gg-server-icon"
              [class.active]="selectedServer?.id === s.id"
              (click)="selectServer.emit(s)"
              [title]="s.name"
            >
              @if (serverAvatar && serverAvatar(s); as avatarUrl) {
                @if (!loadedIds.has(s.id)) {
                  <div class="gg-server-sk"></div>
                }
                <img loading="lazy" decoding="async" [src]="avatarUrl" alt="{{ s.name }}" class="gg-server-img" [class.gg-server-img-hidden]="!loadedIds.has(s.id)" (load)="onAvatarLoad(s.id)" />
              } @else {
                <span class="gg-server-initial">{{ serverInitial ? serverInitial(s) : (s.name ? s.name[0] : '?') }}</span>
              }
            </div>
          }

          <div class="gg-server-divider"></div>
        }

        <div class="gg-server-icon gg-server-add" (click)="openCreateServer.emit()" title="Create or Join Server">
          <span class="gg-server-initial gg-add-plus">+</span>
        </div>
      </div>
    </aside>
  `,
  styleUrls: ['../gg-chat.component.scss']
})
export class ServerListComponent {
  @Input() viewMode: string = 'friends';
  @Input() set servers(value: GgServer[]) {
    this._servers = value;
  }
  get servers(): GgServer[] { return this._servers; }
  private _servers: GgServer[] = [];

  @Input() serverLoading = false;
  @Input() selectedServer: GgServer | null = null;
  @Input() serverAvatar?: (server: GgServer) => string | null;
  @Input() serverInitial?: (server: GgServer) => string | null;

  loadedIds = new Set<number>();

  onAvatarLoad(id: number): void {
    this.loadedIds = new Set([...this.loadedIds, id]);
  }

  @Output() goToDms = new EventEmitter<void>();
  @Output() selectServer = new EventEmitter<GgServer>();
  @Output() openCreateServer = new EventEmitter<void>();
}
