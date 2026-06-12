import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ChatService, GgServer, GgServerMember, GgChannel } from '../../../services/chat.service';
import { AuthService } from '../../../services/auth.service';
import { UsersService } from '../../../services/users.service';
import { CyberConfirmComponent } from '../../../components/cyber-confirm/cyber-confirm.component';
import { MemberHoverCardComponent } from '../../../components/member-hover-card/member-hover-card.component';
import { Socket } from 'socket.io-client';

const ALL_PERMISSIONS = [
  { id: 'manage_server', label: 'Manage Server', desc: 'Rename server, change settings' },
  { id: 'manage_channels', label: 'Manage Channels', desc: 'Create, edit, delete channels' },
  { id: 'manage_roles', label: 'Manage Roles', desc: 'Create, edit, delete roles' },
  { id: 'manage_messages', label: 'Manage Messages', desc: 'Delete any message' },
  { id: 'manage_members', label: 'Manage Members', desc: 'Assign roles to members' },
  { id: 'kick_members', label: 'Kick Members', desc: 'Remove members from server' },
  { id: 'manage_soundboard', label: 'Manage Soundboard', desc: 'Upload, delete server sounds' },
  { id: 'control_voice', label: 'Control Voice', desc: 'Mute, deafen, disconnect others in voice' },
];

@Component({
  selector: 'app-server-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, DragDropModule, CyberConfirmComponent, MemberHoverCardComponent],
  templateUrl: './server-settings.component.html',
  styleUrls: ['./server-settings.component.scss'],
})
export class ServerSettingsComponent implements OnInit, OnDestroy {
  server: GgServer | null = null;
  members: GgServerMember[] = [];
  channels: GgChannel[] = [];
  categories: any[] = [];
  roles: any[] = [];
  serverId = 0;
  loading = true;
  tab: 'overview' | 'roles' | 'members' | 'channels' | 'profile' = 'overview';
  private socket: Socket | null = null;

  // Members search/roles
  memberSearch = '';
  memberRoleSearch = '';
  roleDropdownOpen: string | null = null;

  // Roles/permissions search
  roleSearch = '';
  permissionSearch = '';

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

  // Channels/Categories
  newCategoryName = '';
  editingCategoryId: number | null = null;
  editCategoryName = '';
  editingCategoryRoles: { catId: number; roles: string[] } | null = null;
  categoryRoleSearch = '';
  channelSearch = '';
  uncategorizedChannels: any[] = [];
  categoryChannelLists: Map<string, any[]> = new Map();

  // Per-server profile
  serverProfile: any = null;

  get dropListIds(): string[] {
    const ids = ['uncategorized'];
    for (const cat of this.categories) ids.push('cat-' + cat.id);
    return ids;
  }

  readonly allPermissions = ALL_PERMISSIONS;

  @HostListener('document:click')
  onDocClick(): void {
    if (this.roleDropdownOpen) {
      this.roleDropdownOpen = null;
      this.cdr.markForCheck();
    }
  }

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
    readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.serverId = Number(this.route.snapshot.paramMap.get('id'));
    if (!this.serverId) {
      this.router.navigate(['/gg-chat']);
      return;
    }
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        this.tab = params['tab'];
        if (this.tab === 'profile') this.loadServerProfile();
      }
    });
    this.loadAll();
    this.setupSocket();
  }

  ngOnDestroy(): void {
    this.socket?.off('member-roles-updated');
    this.socket?.off('member-kicked');
    this.socket?.off('member-joined');
    this.socket?.off('member-left');
  }

  private setupSocket(): void {
    this.socket = this.chatService.connect();
    this.socket.on('member-roles-updated', (payload: any) => {
      if (payload?.serverId !== this.serverId) return;
      if (payload?.userId && payload?.roles) {
        this.members = this.members.map(m =>
          String(m.user_id) === String(payload.userId) ? { ...m, roles: payload.roles } : m
        );
        this.cdr.markForCheck();
      }
    });
    this.socket.on('member-kicked', (payload: any) => {
      if (payload?.serverId !== this.serverId) return;
      if (payload?.userId) {
        this.members = this.members.filter(m => String(m.user_id) !== String(payload.userId));
        this.cdr.markForCheck();
      }
    });
    this.socket.on('member-joined', (payload: any) => {
      if (payload?.serverId !== this.serverId) return;
      if (payload?.member) {
        if (!this.members.find(m => String(m.user_id) === String(payload.member.user_id))) {
          this.members = [...this.members, payload.member];
          this.cdr.markForCheck();
        }
      }
    });
    this.socket.on('member-left', (payload: any) => {
      if (payload?.serverId !== this.serverId) return;
      if (payload?.userId) {
        this.members = this.members.filter(m => String(m.user_id) !== String(payload.userId));
        this.cdr.markForCheck();
      }
    });
  }

  loadAll(): void {
    this.loading = true;
    this.cdr.markForCheck();

    let loaded = 0;
    const checkDone = () => {
      loaded++;
      if (loaded >= 5) {
        this.rebuildChannelLists();
        this.loading = false;
        this.cdr.markForCheck();
      }
    };

    this.chatService.getChannels(this.serverId).subscribe({
      next: (ch) => { this.channels = ch; checkDone(); },
      error: () => checkDone(),
    });
    this.chatService.getCategories(this.serverId).subscribe({
      next: (cats) => { this.categories = cats; checkDone(); },
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
    const oldName = this.editingRole.name;
    this.chatService.updateServerRole(this.serverId, oldName, {
      name: this.editRoleName.trim(),
      color: this.editRoleColor,
      permissions: [...this.editRolePermissions],
    }).subscribe({
      next: (updated) => {
        this.roles = this.roles.map(r => r.name === oldName ? { ...r, ...updated, permissions: this.editRolePermissions } : r);
        this.editingRole = null;
        this.cdr.markForCheck();
      },
    });
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

  roleSavingMemberId: string | null = null;
  @ViewChild('hoverCard') hoverCard!: MemberHoverCardComponent;

  hoverCardAvatar: string | null = null;
  hoverCardBanner: string | null = null;

  assignRole(member: GgServerMember, roleName: string): void {
    if (this.roleSavingMemberId) return;
    const current = member.roles ?? [];
    const updated = current.includes(roleName)
      ? current.filter((r: string) => r !== roleName)
      : [...current, roleName];
    this.roleSavingMemberId = member.user_id;
    this.chatService.changeMemberRoles(this.serverId, member.user_id, updated).subscribe({
      next: () => { member.roles = updated; },
      error: () => {},
      complete: () => { this.roleSavingMemberId = null; this.cdr.markForCheck(); },
    });
  }

  isRoleSaving(userId: string): boolean {
    return this.roleSavingMemberId === userId;
  }

  onMemberHover(event: MouseEvent, member: GgServerMember): void {
    this.hoverCardAvatar = (member as any).avatar_url || null;
    this.hoverCardBanner = null;
    this.hoverCard?.show(event, member, 'spot');
  }

  onMemberLeave(): void {
    this.hoverCard?.hide();
  }

  hasRole(member: GgServerMember, roleName: string): boolean {
    return (member.roles ?? []).includes(roleName);
  }

  kickMember(member: GgServerMember): void {
    this.chatService.kickMember(this.serverId, member.user_id).subscribe({
      next: () => { this.members = this.members.filter(m => m.user_id !== member.user_id); },
    });
  }

  filteredMembers(): GgServerMember[] {
    const q = this.memberSearch.toLowerCase().trim();
    const list = q
      ? this.members.filter(m => {
          const name = (this.usernameCache[m.user_id] ?? m.user_id).toLowerCase();
          const roles = (m.roles ?? []).join(' ').toLowerCase();
          return name.includes(q) || roles.includes(q);
        })
      : [...this.members];

    const currentUserId = this.auth.getCurrentUser()?.id;
    const roleRank: Record<string, number> = { owner: 100, admin: 80, moderator: 60, member: 0 };
    return list.sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      const ra = (a.roles ?? [])[0] ?? 'member';
      const rb = (b.roles ?? [])[0] ?? 'member';
      const rankDiff = (roleRank[rb] ?? 0) - (roleRank[ra] ?? 0);
      if (rankDiff !== 0) return rankDiff;
      const na = (this.usernameCache[a.user_id] ?? a.user_id).toLowerCase();
      const nb = (this.usernameCache[b.user_id] ?? b.user_id).toLowerCase();
      return na.localeCompare(nb);
    });
  }

  toggleRoleDropdown(event: Event, userId: string): void {
    event.stopPropagation();
    this.roleDropdownOpen = this.roleDropdownOpen === userId ? null : userId;
    this.memberRoleSearch = '';
    this.cdr.markForCheck();
  }

  onSearchChange(): void {
    this.cdr.markForCheck();
  }

  closeRoleEditor(): void {
    this.roleDropdownOpen = null;
    this.cdr.markForCheck();
  }

  filteredRoles(search: string): any[] {
    const q = search.toLowerCase().trim();
    if (!q) return this.roles;
    return this.roles.filter((r: any) => r.name.toLowerCase().includes(q));
  }

  filteredPermissions(search: string): typeof ALL_PERMISSIONS {
    const q = search.toLowerCase().trim();
    if (!q) return this.allPermissions;
    return this.allPermissions.filter(p => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }

  // ===== CHANNELS =====

  editingChannelRoles: { ch: any; roles: string[]; category: string } | null = null;

  startEditChannelRoles(ch: any): void {
    this.editingChannelRoles = { ch, roles: [...(ch.allowed_roles ?? [])], category: ch.category ?? '' };
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
      if (ecr.category !== (ecr.ch.category ?? '')) {
        this.chatService.setChannelCategory(ecr.ch.id, ecr.category).subscribe(() => {
          ecr.ch.category = ecr.category;
          this.editingChannelRoles = null;
        });
      } else {
        this.editingChannelRoles = null;
      }
    });
  }

  cancelEditChannelRoles(): void {
    this.editingChannelRoles = null;
  }

  // ===== SERVER PROFILE =====

  loadServerProfile(): void {
    const userId = this.auth.getCurrentUser()?.id;
    if (!userId) return;
    this.chatService.getServerProfile(this.serverId, String(userId)).subscribe({
      next: (p) => { this.serverProfile = p; this.cdr.markForCheck(); },
      error: () => { this.serverProfile = null; this.cdr.markForCheck(); },
    });
  }

  onServerProfileAvatarSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.chatService.uploadServerProfileAvatar(this.serverId, file).subscribe({
      next: (res) => {
        this.serverProfile = { ...this.serverProfile, avatar_url: res.url };
        this.cdr.markForCheck();
      },
    });
  }

  onServerProfileBannerSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.chatService.uploadServerProfileBanner(this.serverId, file).subscribe({
      next: (res) => {
        this.serverProfile = { ...this.serverProfile, banner_url: res.url };
        this.cdr.markForCheck();
      },
    });
  }

  removeServerProfileAvatar(): void {
    this.chatService.deleteServerProfileAvatar(this.serverId).subscribe(() => {
      this.serverProfile = { ...this.serverProfile, avatar_url: null };
      this.cdr.markForCheck();
    });
  }

  removeServerProfileBanner(): void {
    this.chatService.deleteServerProfileBanner(this.serverId).subscribe(() => {
      this.serverProfile = { ...this.serverProfile, banner_url: null };
      this.cdr.markForCheck();
    });
  }

  // ===== CATEGORIES =====

  addCategory(): void {
    if (!this.newCategoryName.trim()) return;
    if (this.categories.some(c => c.name === this.newCategoryName.trim())) return;
    this.chatService.createCategory(this.serverId, this.newCategoryName.trim()).subscribe({
      next: (cat) => {
        this.categories = [...this.categories, cat];
        this.newCategoryName = '';
        this.rebuildChannelLists();
        this.cdr.markForCheck();
      },
    });
  }

  startEditCategory(cat: any): void {
    this.editingCategoryId = cat.id;
    this.editCategoryName = cat.name;
  }

  saveCategoryEdit(cat: any): void {
    const name = this.editCategoryName.trim();
    if (!name || name === cat.name) { this.editingCategoryId = null; return; }
    // If another category already has this name, merge channels into it then delete
    const existing = this.categories.find(c => c.id !== cat.id && c.name === name);
    if (existing) {
      const channelsToMove = this.channels.filter(ch => ch.category === cat.name);
      let done = 0;
      const afterAll = () => { done++; if (done >= channelsToMove.length) { this.categories = this.categories.filter(c => c.id !== cat.id); this.rebuildChannelLists(); this.editingCategoryId = null; this.cdr.markForCheck(); } };
      if (channelsToMove.length === 0) { afterAll(); return; }
      for (const ch of channelsToMove) {
        ch.category = name;
        this.chatService.moveChannelToCategory(ch.id, name).subscribe({ next: afterAll, error: afterAll });
      }
      return;
    }
    this.chatService.updateCategory(cat.id, { name }).subscribe(() => {
      const oldName = cat.name;
      this.channels.forEach(ch => { if (ch.category === oldName) ch.category = name; });
      cat.name = name;
      this.editingCategoryId = null;
      this.rebuildChannelLists();
      this.cdr.markForCheck();
    });
  }

  cancelCategoryEdit(): void {
    this.editingCategoryId = null;
  }

  deleteCategory(cat: any): void {
    this.chatService.deleteCategory(cat.id).subscribe(() => {
      this.channels.forEach(ch => { if (ch.category === cat.name) ch.category = ''; });
      this.categories = this.categories.filter(c => c.id !== cat.id);
      this.rebuildChannelLists();
      this.cdr.markForCheck();
    });
  }

  startEditCategoryRoles(cat: any): void {
    this.editingCategoryRoles = { catId: cat.id, roles: [...(cat.allowed_roles ?? [])] };
    this.categoryRoleSearch = '';
  }

  toggleCategoryRole(role: string): void {
    if (!this.editingCategoryRoles) return;
    const idx = this.editingCategoryRoles.roles.indexOf(role);
    if (idx >= 0) this.editingCategoryRoles.roles.splice(idx, 1);
    else this.editingCategoryRoles.roles.push(role);
  }

  hasCategoryRole(role: string): boolean {
    return this.editingCategoryRoles?.roles.includes(role) ?? false;
  }

  saveCategoryRoles(cat: any): void {
    if (!this.editingCategoryRoles) return;
    this.chatService.setCategoryRoles(cat.id, this.editingCategoryRoles.roles).subscribe(() => {
      cat.allowed_roles = [...this.editingCategoryRoles!.roles];
      this.editingCategoryRoles = null;
      this.cdr.markForCheck();
    });
  }

  cancelCategoryRoles(): void {
    this.editingCategoryRoles = null;
  }

  filteredCategoryRoles(): any[] {
    const q = this.categoryRoleSearch.toLowerCase();
    return this.roles.filter(r => r.name !== 'owner' && (!q || r.name.toLowerCase().includes(q)));
  }

  rebuildChannelLists(): void {
    this.uncategorizedChannels = this.channels.filter(ch => !ch.category || ch.category === '');
    const newMap = new Map<string, any[]>();
    for (const cat of this.categories) {
      newMap.set(cat.name, this.channels.filter(ch => ch.category === cat.name));
    }
    this.categoryChannelLists = newMap;
  }

  getCategoryChannels(catName: string): any[] {
    return this.categoryChannelLists.get(catName) ?? [];
  }

  onChannelDrop(event: CdkDragDrop<any[]>, targetCategory: string): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const ch = event.previousContainer.data[event.previousIndex];
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      ch.category = targetCategory;
      this.chatService.moveChannelToCategory(ch.id, targetCategory).subscribe();
    }
    this.rebuildChannelLists();
    this.cdr.markForCheck();
  }

  onCategoryDrop(event: CdkDragDrop<any[]>): void {
    moveItemInArray(this.categories, event.previousIndex, event.currentIndex);
    const orderedIds = this.categories.map(c => c.id);
    this.chatService.reorderCategories(this.serverId, orderedIds).subscribe();
    this.cdr.markForCheck();
  }

  get isOwner(): boolean {
    return this.members.find(m => m.user_id === this.auth.getCurrentUser()?.id)?.roles?.includes('owner') ?? false;
  }

  getRoleColor(roleName: string): string {
    const role = this.roles.find((r: any) => r.name === roleName);
    return role?.color || 'var(--color-primary)';
  }

  // ===== DANGER ZONE =====

  confirmData: { message: string; action: () => void; confirmLabel: string; cancelLabel: string; showCancel: boolean } | null = null;

  showCyberConfirm(message: string, action: () => void, confirmLabel = 'Confirm', cancelLabel = 'Cancel'): void {
    this.confirmData = { message, action, confirmLabel, cancelLabel, showCancel: true };
    this.cdr.markForCheck();
  }

  executeConfirm(): void {
    if (this.confirmData?.action) {
      this.confirmData.action();
    }
    this.confirmData = null;
  }

  dismissConfirm(): void {
    this.confirmData = null;
  }

  confirmDeleteServer(): void {
    if (!this.server) return;
    this.showCyberConfirm(
      `Delete "${this.server.name}" and all its channels? This cannot be undone.`,
      () => this.deleteServer(),
      'Delete Server',
      'Cancel'
    );
  }

  deleteServer(): void {
    if (!this.server) return;
    this.chatService.deleteServer(this.serverId).subscribe({
      next: () => {
        this.router.navigate(['/gg-chat']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/gg-chat']);
  }
}
