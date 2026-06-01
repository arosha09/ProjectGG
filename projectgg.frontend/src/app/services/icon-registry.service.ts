import { Injectable, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Registers the local Material Icons SVG set with Angular Material's
 * MatIconRegistry, so <mat-icon svgIcon="people"> renders the local
 * SVG file from /assets/icons/people.svg instead of falling back to the
 * text ligature from the (incomplete) material-icons.woff2 subset.
 *
 * The SVG files live in public/assets/icons/ — there is one per icon
 * name. The font file is a 125 KB subset that does not include all
 * ligatures (notably `people`, `style`, `redeem`, etc.), which is why
 * broken text fragments were showing up in the sidebar. Routing the
 * icons through SVGs fixes that and matches the local-assets rule.
 */
@Injectable({ providedIn: 'root' })
export class IconRegistryService {
  private readonly registry = inject(MatIconRegistry);
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Names that appear as <mat-icon svgIcon="NAME"></mat-icon> anywhere in the app.
   * Add new ones here when introducing a new icon, or — better — switch
   * the call site to <mat-icon svgIcon="NAME"> and let the registry
   * below handle it without the user ever seeing a broken glyph.
   *
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

  register(): void {
    const base = '/assets/icons/';
    for (const name of IconRegistryService.ICON_NAMES) {
      // MatIconRegistry dedupes by name, so calling this repeatedly is safe.
      this.registry.addSvgIcon(
        name,
        this.sanitizer.bypassSecurityTrustResourceUrl(`${base}${name}.svg`),
      );
    }
  }
}

