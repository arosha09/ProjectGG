import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export type CursorType = 'default' | 'pointer' | 'text' | 'wait' | 'busy' | 'help' | 'crosshair' | 'notAllowed';

export interface CursorSet {
  id: string;
  label: string;
  description?: string;
  cursors: Record<CursorType, string>;
}

const CURSOR_SETS: CursorSet[] = [
  {
    id: 'cyber',
    label: 'Cyberpunk',
    cursors: {
      default: "url('/assets/cursors/cyber/arrow.cur'), auto",
      pointer: "url('/assets/cursors/cyber/link.cur'), pointer",
      text: "url('/assets/cursors/cyber/beam.cur'), text",
      wait: "url('/assets/cursors/cyber/wait.cur'), wait",
      busy: "url('/assets/cursors/cyber/busy.cur'), progress",
      help: "url('/assets/cursors/cyber/help.cur'), help",
      crosshair: "url('/assets/cursors/cyber/cross.cur'), crosshair",
      notAllowed: "url('/assets/cursors/cyber/no.cur'), not-allowed",
    },
  },
  {
    id: 'assassinsCreed',
    label: 'Assassin\'s Creed',
    cursors: {
      default: "url('/assets/cursors/assassinsCreed/arrow.cur'), auto",
      pointer: "url('/assets/cursors/assassinsCreed/link.cur'), pointer",
      text: "url('/assets/cursors/assassinsCreed/beam.cur'), text",
      wait: "url('/assets/cursors/assassinsCreed/wait.cur'), wait",
      busy: "url('/assets/cursors/assassinsCreed/busy.cur'), progress",
      help: "url('/assets/cursors/assassinsCreed/help.cur'), help",
      crosshair: "url('/assets/cursors/assassinsCreed/cross.cur'), crosshair",
      notAllowed: "url('/assets/cursors/assassinsCreed/no.cur'), not-allowed",
    },
  },
  // {
  //   id: 'widow',
  //   label: 'Widow',
  //   cursors: {
  //     default: "url('/assets/cursors/widow/arrow.ani'), auto",
  //     pointer: "url('/assets/cursors/widow/link.ani'), pointer",
  //     text: "url('/assets/cursors/widow/beam.ani'), text",
  //     wait: "url('/assets/cursors/widow/wait.ani'), wait",
  //     busy: "url('/assets/cursors/widow/busy.ani'), progress",
  //     help: "url('/assets/cursors/widow/help.ani'), help",
  //     crosshair: "url('/assets/cursors/widow/cross.ani'), crosshair",
  //     notAllowed: "url('/assets/cursors/widow /no.ani'), not-allowed",
  //   },
  // },
];

@Injectable({
  providedIn: 'root',
})
export class CursorService {
  private readonly apiUrl = environment.apiUrl;
  private readonly storageKey = 'selectedCursorSet';
  private cursorSetId: string = 'cyber';
  private styleTag: HTMLStyleElement | null = null;
  private renderer: Renderer2;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    rendererFactory: RendererFactory2,
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  init(): void {
    const saved = localStorage.getItem(this.storageKey);
    this.cursorSetId = saved && CURSOR_SETS.some((s) => s.id === saved) ? saved : 'cyber';
    this.applyCursorStyle();

    this.auth.currentUser$.subscribe((user) => {
      if (user?.cursor_preference && user.cursor_preference !== this.cursorSetId) {
        this.cursorSetId = user.cursor_preference;
        localStorage.setItem(this.storageKey, this.cursorSetId);
        this.applyCursorStyle();
      } else if (!user) {
        const local = localStorage.getItem(this.storageKey);
        if (local && local !== this.cursorSetId) {
          this.cursorSetId = local;
          this.applyCursorStyle();
        }
      }
    });
  }

  get cursorSets(): CursorSet[] {
    return CURSOR_SETS;
  }

  get currentSet(): CursorSet {
    return CURSOR_SETS.find((s) => s.id === this.cursorSetId) ?? CURSOR_SETS[0];
  }

  get currentSetId(): string {
    return this.cursorSetId;
  }

  select(id: string): void {
    if (!CURSOR_SETS.some((s) => s.id === id)) return;
    this.cursorSetId = id;
    localStorage.setItem(this.storageKey, id);
    this.applyCursorStyle();

    const user = this.auth.getCurrentUser();
    if (user) {
      this.http.put(`${this.apiUrl}/users/cursor`, { cursor_preference: id }).subscribe();
    }
  }

  private applyCursorStyle(): void {
    if (this.styleTag) {
      this.styleTag.remove();
    }

    const set = this.currentSet;
    const el = this.renderer.createElement('style');
    el.id = 'cursor-set-styles';
    el.innerHTML = `
      html, body {
        cursor: ${set.cursors['default']} !important;
      }
      *, *::before, *::after {
        cursor: inherit !important;
      }
      a[href], button, input[type="submit"], input[type="button"],
      input[type="checkbox"], input[type="radio"], input[type="range"],
      select, summary, label, [onclick],
      [role="button"], [role="tab"], [role="menuitem"], [role="option"],
      [role="switch"], [role="checkbox"], [role="radio"], [role="listbox"],
      [role="combobox"], [role="menuitemcheckbox"], [role="menuitemradio"],
      [tabindex]:not([tabindex="-1"]):not([disabled]),
      .mat-mdc-button-base, .mdc-button, .mat-mdc-select, .mat-mdc-option,
      .mat-mdc-menu-item, .mat-mdc-chip, .mat-mdc-tab, .mat-mdc-list-item,
      .mat-mdc-radio-button, .mat-mdc-checkbox, .mat-mdc-slide-toggle,
      .mat-mdc-slider, .mat-mdc-paginator, .mdc-switch, .mdc-radio,
      .mdc-checkbox, .mdc-tab, mat-icon, .clickable,
      .profile-trigger, .header-notif-wrap, .header-notif-item,
      .mini-viz-art, .mini-player-info {
        cursor: ${set.cursors['pointer']} !important;
      }
      input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]),
      textarea,
      [contenteditable],
      [contenteditable="true"],
      [contenteditable="plaintext-only"] {
        cursor: ${set.cursors['text']} !important;
      }
      input::-webkit-credentials-auto-fill-button,
      input::-webkit-contacts-auto-fill-button,
      input::-webkit-autofill-button {
        cursor: ${set.cursors['pointer']} !important;
      }
      .mat-form-field-wrapper, .mat-mdc-text-field-wrapper,
      .mat-form-field-flex, .mat-mdc-form-field-flex,
      .mat-form-field-infix, .mat-mdc-form-field-infix,
      .mat-form-field, .mat-mdc-form-field,
      .mat-input-element {
        cursor: inherit;
      }
      .loading, [aria-busy="true"] {
        cursor: ${set.cursors['wait']} !important;
      }
      .busy {
        cursor: ${set.cursors['busy']} !important;
      }
      [title]:not(a):not(button):not(input):not(textarea):not(select):not([role="button"]):not(.mat-mdc-button-base):not(.mdc-button):not(.gg-server-icon):not(.gg-channel):not(.gg-dm-icon):not(.gg-friends-btn):not(.gg-add-friend-btn):not(.gg-friend-row):not(.gg-type-option):not(.gg-modal-close):not(.gg-friend-action-btn), .help {
        cursor: ${set.cursors['help']} !important;
      }
      .crosshair {
        cursor: ${set.cursors['crosshair']} !important;
      }
      :disabled, [disabled], [aria-disabled="true"], .not-allowed {
        cursor: ${set.cursors['notAllowed']} !important;
      }
      .cursor-preview-box {
        cursor: inherit;
      }
    `;
    this.styleTag = el;
    this.renderer.appendChild(document.head, this.styleTag);
  }
}
