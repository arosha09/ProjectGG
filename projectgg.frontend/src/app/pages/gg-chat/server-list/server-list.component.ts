
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
          <mat-icon class="gg-dm-svg">chat</mat-icon>
        </div>

        <div class="gg-server-divider"></div>

        <!-- Render actual servers -->
        <ng-container *ngFor="let s of servers">
          <div
            class="gg-server-icon"
            [class.active]="selectedServer?.id === s.id"
            (click)="selectServer.emit(s)"
            [title]="s.name"
          >
            <img loading="lazy" decoding="async" *ngIf="serverAvatar && serverAvatar(s)" [src]="serverAvatar(s)" alt="{{ s.name }}" class="gg-server-img" (error)="$event.target.style.display='none'" />
            <span *ngIf="!(serverAvatar && serverAvatar(s))" class="gg-server-initial">{{ serverInitial ? serverInitial(s) : (s.name ? s.name[0] : '?') }}</span>
          </div>
        </ng-container>

        <div class="gg-server-divider"></div>

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
    console.log('ServerListComponent: servers input updated', value);
    this._servers = value;
  }
  get servers(): GgServer[] { return this._servers; }
  private _servers: GgServer[] = [];

  @Input() serverLoading = false;
  @Input() selectedServer: GgServer | null = null;
  @Input() serverAvatar?: (server: GgServer) => string | null;
  @Input() serverInitial?: (server: GgServer) => string | null;
  
  @Output() goToDms = new EventEmitter<void>();
  @Output() selectServer = new EventEmitter<GgServer>();
  @Output() openCreateServer = new EventEmitter<void>();
}
