import {
  Component, Input, Output, EventEmitter, ChangeDetectionStrategy,
  HostListener, ElementRef, ChangeDetectorRef, OnChanges, OnDestroy, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

export interface DropdownItem {
  label: string;
  icon?: string;
  link?: string;
  action?: () => void;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-cyber-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, RouterLink],
  templateUrl: './cyber-dropdown.component.html',
  styleUrls: ['./cyber-dropdown.component.scss']
})
export class CyberDropdownComponent implements OnChanges, OnDestroy {
  @Input() items: DropdownItem[] = [];
  @Input() isOpen = false;
  @Input() isAdmin = false;
  @Input() avatarUrl: string | null = null;
  @Input() userName: string | null = null;
  @Input() currentStatus: string | null = null;
  @Input() margin = '0';
  @Input() closeOnUnfocus = true;
  @Output() itemSelect = new EventEmitter<DropdownItem>();
  @Output() statusChange = new EventEmitter<string>();
  @Output() isOpenChange = new EventEmitter<boolean>();
  @Output() closeDropdown = new EventEmitter<void>();

  statusSubmenuOpen = false;

  statusOptions = [
    { id: 'online', label: 'Online', color: '#00ff88' },
    { id: 'away', label: 'Away', color: '#ffd700' },
    { id: 'dnd', label: 'Do Not Disturb', color: '#ff5f6d' },
    { id: 'invisible', label: 'Invisible', color: '#888888' },
  ];

  private documentMouseDownHandler = (event: MouseEvent) => {
    if (!this.isOpen) return;
    const target = event.target as Node;
    if (this.elRef.nativeElement.contains(target)) return;
    this.close();
  };

  constructor(
    private readonly elRef: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) {
        this.attachDocumentListener();
      } else {
        this.statusSubmenuOpen = false;
        this.detachDocumentListener();
      }
    }
  }

  ngOnDestroy(): void {
    this.detachDocumentListener();
  }

  private attachDocumentListener(): void {
    document.addEventListener('mousedown', this.documentMouseDownHandler, true);
  }

  private detachDocumentListener(): void {
    document.removeEventListener('mousedown', this.documentMouseDownHandler, true);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpenChange.emit(false);
    this.closeDropdown.emit();
  }

  selectItem(item: DropdownItem) {
    if (item.action) item.action();
    this.itemSelect.emit(item);
    this.close();
  }

  selectStatus(status: string) {
    this.statusChange.emit(status);
    this.close();
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  get genderLabel(): string | null {
    return this.userName;
  }
}
