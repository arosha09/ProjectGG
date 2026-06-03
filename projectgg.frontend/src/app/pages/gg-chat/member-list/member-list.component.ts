
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GgServer, GgServerMember } from '../../../services/chat.service';

@Component({
  selector: 'app-member-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <aside class="gg-members" [class.gg-members-hidden]="viewMode === 'dm' || viewMode === 'friends'">
      @if (viewMode === 'server' && selectedServer) {
        <div class="gg-members-head">Members — {{ members.length }}</div>
        <div class="gg-members-scroll">
          @if (membersLoading) {
            @for (_ of [1,2,3,4,5]; track _) {
              <div class="gg-sk-member">
                <div class="gg-sk-member-avatar"></div>
                <div class="gg-sk-member-lines">
                  <div class="gg-sk-line gg-sk-w60"></div>
                  <div class="gg-sk-line gg-sk-w40"></div>
                </div>
              </div>
            }
          } @else {
            @for (member of members; track member.user_id) {
              <div class="gg-member" (contextmenu)="onMemberContextMenu($event, member)">
                <div class="gg-member-avatar">
                  <div class="gg-avatar-sk"></div>
                  <img loading="lazy" decoding="async" [src]="resolveAvatar(member, 'avatar_url')" alt="" class="gg-member-img" (error)="onAvatarError($event); $event.target.previousElementSibling?.classList?.add('sk-err')" (load)="$event.target.previousElementSibling?.classList?.add('sk-hidden')" />
                  <span class="gg-user-status-dot"
                    [class.online]="memberStatus(member.user_id) === 'online'"
                    [class.away]="memberStatus(member.user_id) === 'away'"
                    [class.dnd]="memberStatus(member.user_id) === 'dnd'"
                    [class.invisible]="memberStatus(member.user_id) === 'invisible'"
                  ></span>
                </div>
                <div class="gg-member-info">
                  <span class="gg-member-name">{{ member.username ?? member.user_id }}</span>
                  <div class="gg-member-role-row">
                    @if (member.roles.includes('owner')) {
                      <span class="gg-member-role gg-role-owner">Owner</span>
                    } @else if (member.roles.includes('admin')) {
                      @if (!isSelf(member) && canManageRoles()) {
                        <button class="gg-role-btn gg-role-admin" (click)="changeRole.emit({member, role: 'moderator'})" title="Demote to Moderator">Admin</button>
                      } @else {
                        <span class="gg-member-role gg-role-admin">Admin</span>
                      }
                    } @else if (member.roles.includes('moderator')) {
                      @if (!isSelf(member) && canManageRoles()) {
                        <button class="gg-role-btn gg-role-moderator" (click)="changeRole.emit({member, role: 'member'})" title="Demote to Member">Mod</button>
                      } @else {
                        <span class="gg-member-role gg-role-moderator">Mod</span>
                      }
                    }
                    @if (!isSelf(member) && canKick() && !member.roles.includes('owner')) {
                      <button class="gg-member-kick" (click)="confirmKick.emit(member)" title="Kick">X</button>
                      <button class="gg-member-ban" (click)="confirmBan.emit(member)" title="Ban">
                        <mat-icon svgIcon="block"></mat-icon>
                      </button>
                    }
                  </div>
                </div>
              </div>
            }
          }
        </div>
      }
    </aside>
  `,
  styleUrls: ['../gg-chat.component.scss']
})
export class MemberListComponent {
  @Input() viewMode: 'dm' | 'server' | 'create-server' | 'profile' | 'friends' | 'trading' = 'friends';
  @Input() selectedServer: GgServer | null = null;
  @Input() members: GgServerMember[] = [];
  @Input() membersLoading = false;
  
  @Input() isSelf!: (member: GgServerMember) => boolean;
  @Input() canManageRoles!: () => boolean;
  @Input() canKick!: () => boolean;
  @Input() memberStatus!: (userId: string) => string;
  @Input() resolveAvatar!: (user: any, ...keys: string[]) => string;
  @Input() onAvatarError!: (event: Event) => void;
  
  @Output() changeRole = new EventEmitter<{member: GgServerMember, role: string}>();
  @Output() confirmKick = new EventEmitter<GgServerMember>();
  @Output() confirmBan = new EventEmitter<GgServerMember>();
  @Output() memberContextMenu = new EventEmitter<{event: MouseEvent; member: GgServerMember}>();

  onMemberContextMenu(event: MouseEvent, member: GgServerMember): void {
    event.preventDefault();
    this.memberContextMenu.emit({ event, member });
  }
}

