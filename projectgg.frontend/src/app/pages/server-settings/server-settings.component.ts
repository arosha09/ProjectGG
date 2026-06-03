import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ChatService, GgServer, GgServerMember, GgChannel } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';

const ALL_PERMISSIONS = [
  { id: 'manage_server', label: 'Manage Server', desc: 'Rename server, change settings' },
  { id: 'manage_channels', label: 'Manage Channels', desc: 'Create, edit, delete channels' },
  { id: 'manage_roles', label: 'Manage Roles', desc: 'Create, edit, delete roles' },
  { id: 'manage_messages', label: 'Manage Messages', desc: 'Delete any message' },
  { id: 'manage_members', label: 'Manage Members', desc: 'Assign roles to members' },
  { id: 'kick_members', label: 'Kick Members', desc: 'Remove members from server' },
];

@Component({
  selector: 'app-server-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './server-settings.component.html',
  styleUrls: ['./server-settings.component.scss'],
})
export class ServerSettingsComponent implements OnInit {
  server: GgServer | null = null;
  members: GgServerMember[] = [];
  channels: GgChannel[] = [];
  roles: any[] = [];
  serverId = 0;
  loading = true;
  tab: 'overview' | 'roles' | 'members' | 'channels' = 'overview';

  // Role creation/editing
  newRoleName = '';
  newRoleColor = '#00f0ff';
  newRolePermissions: string[] = [];
  editingRole: any = null;
  editRoleName = '';
  editRoleColor = '';
  editRolePermissions: string[] = [];

  // Server editing
  editingServer = false;
  editServerName = '';

  // Members
  usernameCache: Record<string, string> = {};

  // Avatar/Banner
  avatarPreview: string | null = null;
  bannerPreview: string | null = null;
  uploadingAvatar = false;
  uploadingBanner = false;
  bannerHover = false;
  iconHover = false;
  bannerLoaded = false;
  iconLoaded = false;

  readonly allPermissions = ALL_PERMISSIONS;

  private setServer(s: GgServer): void {
    this.bannerLoaded = false;
    this.iconLoaded = false;
    this.server = s;
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly chatService: ChatService,
    private readonly auth: AuthService,
    private readonly usersService: UsersService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.serverId = Number(this.route.snapshot.paramMap.get('id'));
    if (!this.serverId) {
      this.router.navigate(['/gg-chat']);
      return;
    }
    this.route.queryParams.subscribe(params => {
      if (params['tab']) this.tab = params['tab'];
    });
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.cdr.markForCheck();

    let loaded = 0;
    const checkDone = () => {
      loaded++;
      if (loaded >= 4) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    };

    this.chatService.getChannels(this.serverId).subscribe({
      next: (ch) => { this.channels = ch; checkDone(); },
      error: () => checkDone(),
    });
    this.chatService.getServerRoles(this.serverId).subscribe({
      next: (r: any[]) => {
        this.roles = r;
        if (!this.roles.find((role: any) => role.name === 'owner')) {
          this.roles.unshift({ name: 'owner', color: '#ffd700', is_owner: true, permissions: ALL_PERMISSIONS.map((p: any) => p.id) });
        }
        checkDone();
      },
      error: () => checkDone(),
    });
    this.chatService.getServerMembers(this.serverId).subscribe({
      next: (m: any[]) => {
        this.members = m;
        this.loadUsernames();
        checkDone();
      },
      error: () => checkDone(),
    });
    this.chatService.getServer(this.serverId).subscribe({
      next: (s) => {
        this.setServer(s);
        this.editServerName = s.name;
        checkDone();
      },
      error: () => checkDone(),
    });
  }

  // ===== SERVER OVERVIEW =====

  saveServerName(): void {
    if (!this.editServerName.trim() || !this.server) return;
    this.chatService.updateServer(this.serverId, { name: this.editServerName.trim() }).subscribe({
      next: (updated) => {
        this.setServer(updated);
        this.editingServer = false;
        this.cdr.markForCheck();
      },
    });
  }

  onAvatarSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.avatarPreview = URL.createObjectURL(file);
    this.uploadingAvatar = true;
    this.cdr.markForCheck();
    this.chatService.uploadServerAvatar(this.serverId, file).subscribe({
      next: (updated) => {
        this.setServer(updated);
        this.avatarPreview = null;
        this.uploadingAvatar = false;
        this.cdr.markForCheck();
      },
      error: () => { this.avatarPreview = null; this.uploadingAvatar = false; this.cdr.markForCheck(); },
    });
  }

  onBannerSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.bannerPreview = URL.createObjectURL(file);
    this.uploadingBanner = true;
    this.cdr.markForCheck();
    this.chatService.uploadServerBanner(this.serverId, file).subscribe({
      next: (updated) => {
        this.setServer(updated);
        this.bannerPreview = null;
        this.uploadingBanner = false;
        this.cdr.markForCheck();
      },
      error: () => { this.bannerPreview = null; this.uploadingBanner = false; this.cdr.markForCheck(); },
    });
  }

  removeBanner(): void {
    this.chatService.updateServer(this.serverId, { banner_url: '' }).subscribe({
      next: (updated) => { this.setServer(updated); this.cdr.markForCheck(); },
    });
  }

  private loadUsernames(): void {
    for (const member of this.members) {
      if (member.username && !this.usernameCache[member.user_id]) {
        this.usernameCache[member.user_id] = member.username;
      }
    }
  }

  getUsername(userId: string): string {
    return this.usernameCache[userId] ?? userId.slice(0, 8);
  }

  // ===== ROLES =====

  createRole(): void {
    if (!this.newRoleName.trim()) return;
    this.chatService.createServerRole(this.serverId, this.newRoleName.trim(), this.newRoleColor, this.newRolePermissions).subscribe({
      next: (role: any) => {
        this.roles = [...this.roles.filter((r: any) => r.name !== 'owner'), { ...role, permissions: this.newRolePermissions }];
        this.newRoleName = '';
        this.newRoleColor = '#00f0ff';
        this.newRolePermissions = [];
      },
    });
  }

  startEditRole(role: any): void {
    this.editingRole = role;
    this.editRoleName = role.name;
    this.editRoleColor = role.color || '#00f0ff';
    this.editRolePermissions = [...(role.permissions ?? [])];
  }

  deleteRole(roleName: string): void {
    if (roleName === 'owner') return; // Owner cannot be deleted
    this.chatService.deleteServerRole(this.serverId, roleName).subscribe({
      next: () => {
        this.roles = this.roles.filter((r: any) => r.name !== roleName);
      },
    });
  }

  saveEditRole(): void {
    if (!this.editRoleName.trim() || !this.editingRole) return;
    // For now just update locally (backend role update can be added later)
    this.editingRole.name = this.editRoleName.trim();
    this.editingRole.color = this.editRoleColor;
    this.editingRole.permissions = [...this.editRolePermissions];
    this.editingRole = null;
  }

  cancelEditRole(): void {
    this.editingRole = null;
  }

  togglePermission(permId: string, target: string[]): void {
    const idx = target.indexOf(permId);
    if (idx >= 0) target.splice(idx, 1);
    else target.push(permId);
  }

  hasPermission(permId: string, target: string[]): boolean {
    return target.includes(permId);
  }

  // ===== MEMBERS =====

  assignRole(member: GgServerMember, roleName: string): void {
    const current = member.roles ?? [];
    const updated = current.includes(roleName)
      ? current.filter((r: string) => r !== roleName)
      : [...current, roleName];
    this.chatService.changeMemberRoles(this.serverId, member.user_id, updated).subscribe({
      next: () => { member.roles = updated; },
    });
  }

  hasRole(member: GgServerMember, roleName: string): boolean {
    return (member.roles ?? []).includes(roleName);
  }

  kickMember(member: GgServerMember): void {
    this.chatService.kickMember(this.serverId, member.user_id).subscribe({
      next: () => { this.members = this.members.filter(m => m.user_id !== member.user_id); },
    });
  }

  // ===== CHANNELS =====

  editingChannelRoles: { ch: any; roles: string[] } | null = null;

  startEditChannelRoles(ch: any): void {
    this.editingChannelRoles = { ch, roles: [...(ch.allowed_roles ?? [])] };
  }

  toggleChannelRole(role: string): void {
    if (!this.editingChannelRoles) return;
    const idx = this.editingChannelRoles.roles.indexOf(role);
    if (idx >= 0) this.editingChannelRoles.roles.splice(idx, 1);
    else this.editingChannelRoles.roles.push(role);
  }

  saveChannelRoles(): void {
    const ecr = this.editingChannelRoles;
    if (!ecr) return;
    this.chatService.setChannelRoles(ecr.ch.id, ecr.roles).subscribe(() => {
      ecr.ch.allowed_roles = [...ecr.roles];
      this.editingChannelRoles = null;
    });
  }

  cancelEditChannelRoles(): void {
    this.editingChannelRoles = null;
  }

  get isOwner(): boolean {
    return this.members.find(m => m.user_id === this.auth.getCurrentUser()?.id)?.roles?.includes('owner') ?? false;
  }

  getRoleColor(roleName: string): string {
    const role = this.roles.find((r: any) => r.name === roleName);
    return role?.color || 'var(--color-primary)';
  }

  goBack(): void {
    this.router.navigate(['/gg-chat']);
  }
}
