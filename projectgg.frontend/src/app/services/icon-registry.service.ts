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
    'add', 'add_link', 'add_photo_alternate', 'admin_panel_settings',
    'arrow_back', 'arrow_drop_down', 'arrow_forward', 'assignment',
    'attach_file', 'attachment', 'auto_awesome',
    'badge', 'block', 'bolt', 'bug_report',
    'calendar_today', 'call', 'call_made', 'call_received', 'cancel',
    'card_giftcard', 'casino', 'celebration', 'chat', 'chat_bubble',
    'check', 'check_circle', 'chevron_right', 'close', 'compare_arrows',
    'confirmation_number', 'content_copy', 'create',
    'delete', 'delete_outline', 'discord', 'dns', 'chat_bubble_outline',
    'drag_indicator',
    'edit', 'emoji_events', 'error', 'error_outline', 'event', 'expand_less', 'expand_more',
    'flash_on', 'folder', 'forum', 'forward_to_inbox', 'fullscreen', 'fullscreen_exit',
    'gif', 'gif_box', 'graphic_eq', 'group', 'group_add',
    'headphones', 'headset', 'headset_mic', 'headset_off', 'help', 'help_outline', 'history',
    'inbox', 'image', 'info', 'inventory_2',
    'keyboard_arrow_down', 'keyboard_arrow_up',
    'library_music', 'link', 'link_off', 'lock', 'lock_open', 'lock_reset',
    'login', 'logout',
    'mail', 'menu', 'memory', 'mic', 'mic_off', 'mood', 'more_horiz',
    'more_vert', 'movie_filter', 'music_note',
    'notifications', 'notifications_active', 'notifications_off', 'open_in_new', 'outbox',
    'palette', 'pause', 'people', 'person', 'person_add', 'person_remove',
    'phone_off', 'photo_camera', 'play_arrow', 'play_circle',
    'playlist_add', 'push_pin', 'queue_music',
    'redeem', 'refresh', 'repeat', 'repeat_one', 'reply',
    'save', 'schedule', 'science', 'search', 'send', 'settings',
    'settings_voice', 'share', 'shield', 'shopping_cart', 'shuffle',
    'skip_next', 'skip_previous', 'sports_esports', 'speed', 'star', 'star_border', 'star_outline',
    'stop', 'style', 'swap_horiz', 'sync',
    'tag', 'thumb_up', 'timer', 'today',
    'upload', 'verified', 'videogame_asset', 'visibility', 'volume_down',
    'volume_off', 'volume_up', 'vpn_key', 'waves',
    'warning', 'work', 'apex', 'hourglass', 'tune', 'record_voice_over', 'subtitles'
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
