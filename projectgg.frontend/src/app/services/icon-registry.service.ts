import { Injectable, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Observable } from 'rxjs';

/**
 * Lazy icon registry for Angular Material.
 *
 * Subclasses `MatIconRegistry` and registers SVG icons on first
 * lookup instead of eagerly at app start. `<mat-icon svgIcon="NAME">`
 * ultimately calls `getNamedSvgIcon` here; we register the URL just
 * in time, then delegate to the parent. The first `<mat-icon>` render
 * triggers registration for that one icon; subsequent renders hit the
 * in-memory cache and the parent registry.
 *
 * Provided via `useClass` in app.config.ts to replace the default
 * `MatIconRegistry` for the whole app.
 *
 * The SVG files live in public/assets/icons/ — there is one per icon
 * name. The font file is a 125 KB subset that does not include all
 * ligatures (notably `people`, `style`, `redeem`, etc.), which is why
 * broken text fragments were showing up in the sidebar. Routing the
 * icons through SVGs fixes that and matches the local-assets rule.
 */
@Injectable({ providedIn: 'root' })
export class IconRegistryService extends MatIconRegistry {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly registered = new Set<string>();
  private static readonly base = '/assets/icons/';

  /**
   * Names that appear as <mat-icon svgIcon="NAME"></mat-icon> anywhere
   * in the app. Add new ones here when introducing a new icon.
   * Keep in sync with the SVG files in public/assets/icons/.
   */
  static readonly ICON_NAMES: readonly string[] = [
    'add', 'arrow_back', 'arrow_forward', 'arrow_upward',
    'call', 'call_made', 'call_received', 'cancel', 'chat', 'chat_bubble',
    'check', 'check_circle', 'chevron_right', 'close', 'code', 'content_copy',
    'create', 'card_giftcard', 'swap_horiz', 'redeem', 'people', 'style',
    'person', 'person_add', 'person_remove', 'group', 'play_circle',
    'edit', 'emoji_emotions', 'favorite', 'favorite_border', 'filter_list',
    'gif', 'gif_box', 'group_add', 'headset_mic', 'headset_off', 'help',
    'home', 'image', 'info', 'inventory_2', 'keyboard_arrow_down',
    'keyboard_arrow_up', 'lock', 'lock_open', 'logout', 'mail', 'menu',
    'mic', 'mic_off', 'more_horiz', 'more_vert', 'music_note', 'notifications',
    'notifications_off', 'palette', 'pause', 'photo_camera', 'play_arrow',
    'playlist_add', 'refresh', 'save', 'schedule', 'search', 'send',
    'settings', 'share', 'shield', 'shopping_cart', 'skip_next', 'skip_previous',
    'star', 'stop', 'sync', 'thumb_up', 'timer', 'volume_off', 'volume_up',
    'warning', 'work', 'auto_awesome', 'repeat', 'memory', 'event',
    'videogame_asset', 'visibility', 'movie_filter', 'link', 'link_off',
    'star_outline', 'assignment', 'upload', 'delete', 'attachment',
    'emoji_events', 'science', 'flash_on', 'history', 'celebration',
    'bug_report', 'badge', 'forward_to_inbox', 'arrow_drop_down', 'login',
    'add_link', 'lock_reset', 'expand_more', 'phone_off', 'settings_voice',
    'forum', 'attach_file', 'open_in_new', 'more_vert', 'casino',
    'confirmation_number', 'block', 'discord', 'headphones'
  ];

  override getNamedSvgIcon(name: string, namespace: string = ''): Observable<SVGElement> {
    if (!this.registered.has(name) && IconRegistryService.ICON_NAMES.includes(name)) {
      this.addSvgIcon(
        name,
        this.sanitizer.bypassSecurityTrustResourceUrl(`${IconRegistryService.base}${name}.svg`),
      );
      this.registered.add(name);
    }
    return super.getNamedSvgIcon(name, namespace);
  }
}
