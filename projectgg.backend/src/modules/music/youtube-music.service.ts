import { Injectable, Logger } from '@nestjs/common';
import { Innertube, UniversalCache } from 'youtubei.js';

export interface YTMusicSearchResult {
  id: string;
  title: string;
  artists: string;
  album?: string;
  duration?: string;
  thumbnail?: string;
  videoId?: string;
  type: 'song' | 'video' | 'album' | 'playlist' | 'artist';
}

export interface YTMusicPlaylist {
  id: string;
  title: string;
  thumbnail?: string;
  count?: number;
  isOwned?: boolean;
}

export interface YTMusicPlaylistTrack {
  id: string;
  title: string;
  artists: string;
  album?: string;
  duration?: string;
  thumbnail?: string;
  videoId?: string;
}

@Injectable()
export class YouTubeMusicService {
  private readonly logger = new Logger(YouTubeMusicService.name);
  private yt: Innertube | null = null;
  private initPromise: Promise<void> | null = null;

  private static NON_MUSIC_PATTERNS = [
    /\b(tutorial|lesson|how\s+to|learn|teach|course|class)\b/i,
    /\b(review|reaction|analysis|breakdown|explained)\b/i,
    /\b(interview|behind\s+the\s+scenes|making\s+of|documentary)\b/i,
    /\b(ringtone|alarm|notification|sound\s+effect|sfx)\b/i,
    /\b(ear\s+rape|bass\s+boosted|bass\s+boost|8d\s+audio|slowed|reverb)\b/i,
  ];

  private static NON_MUSIC_PLAYLIST_PATTERNS = [
    /\b(tutorial|lesson|how\s+to|learn|teach|course|class)\b/i,
    /\b(review|reaction|analysis|breakdown|explained)\b/i,
    /\b(interview|behind\s+the\s+scenes|making\s+of|documentary)\b/i,
    /\b(ringtone|alarm|notification|sound\s+effect|sfx)\b/i,
    /\b(ear\s+rape|bass\s+boosted|bass\s+boost|8d\s+audio|slowed|reverb)\b/i,
    /\b(top\s+\d|best\s+of|greatest\s+hits|compilation)/i,
    /\b(mix|megamix|medley|remix\s+compilation)/i,
    /\b(gaming|gameplay|walkthrough|let\s+play)\b/i,
    /\b(vlog|daily\s+life|routine|morning|night)\b/i,
  ];

  private async ensureInitialized(): Promise<Innertube> {
    if (this.yt) return this.yt;
    if (this.initPromise) {
      await this.initPromise;
      return this.yt!;
    }
    this.initPromise = (async () => {
      try {
        this.yt = await Innertube.create({
          cache: new UniversalCache(false),
        });
        this.logger.log('YouTube Music client initialized');
      } catch (err) {
        this.logger.error('Failed to init YouTube Music client', err);
        throw err;
      }
    })();
    await this.initPromise;
    return this.yt!;
  }

  private extractFromContents(results: any, itemType?: string): any[] {
    const items: any[] = [];
    for (const section of results.contents ?? []) {
      if (section.contents) {
        for (const item of section.contents) {
          if (item.type === 'MusicResponsiveListItem' && (!itemType || item.item_type === itemType)) {
            items.push(item);
          }
        }
      }
      if (section.type === 'MusicResponsiveListItem' && (!itemType || section.item_type === itemType)) {
        items.push(section);
      }
    }
    return items;
  }

  private getLargeThumbnail(item: any): string | undefined {
    const videoId = item.id;
    if (!videoId) return undefined;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  async searchMusic(query: string, limit = 10): Promise<YTMusicSearchResult[]> {
    const yt = await this.ensureInitialized();
    try {
      const results = await yt.music.search(query, { type: 'song' });
      const allItems = this.extractFromContents(results, 'song');

      const items: YTMusicSearchResult[] = [];
      for (const item of allItems.slice(0, limit)) {
        const title = item.title ?? '';
        if (this.isNonMusic(title)) continue;

        items.push({
          id: item.id ?? '',
          title,
          artists: item.artists?.map((a: any) => a.name).join(', ') ?? '',
          album: item.album?.name ?? undefined,
          duration: item.duration?.text ?? undefined,
          thumbnail: this.getLargeThumbnail(item),
          videoId: item.id ?? undefined,
          type: 'song',
        });
      }
      return items;
    } catch (err) {
      this.logger.error(`Music search failed for "${query}"`, err);
      return [];
    }
  }

  async searchAll(query: string, limit = 20): Promise<YTMusicSearchResult[]> {
    const yt = await this.ensureInitialized();
    try {
      const results = await yt.music.search(query);
      const items: YTMusicSearchResult[] = [];
      const allItems = this.extractFromContents(results);

      const songs = allItems.filter(i => i.item_type === 'song');
      for (const s of songs.slice(0, limit)) {
        const title = s.title ?? '';
        if (this.isNonMusic(title)) continue;
        items.push({
          id: s.id ?? '',
          title,
          artists: s.artists?.map((a: any) => a.name).join(', ') ?? '',
          album: s.album?.name ?? undefined,
          duration: s.duration?.text ?? undefined,
          thumbnail: this.getLargeThumbnail(s),
          videoId: s.id ?? undefined,
          type: 'song',
        });
      }

      if (items.length < limit) {
        const videos = allItems.filter(i => i.item_type === 'video');
        for (const v of videos.slice(0, limit - items.length)) {
          const title = v.title ?? '';
          if (this.isNonMusic(title)) continue;
          items.push({
            id: v.id ?? '',
            title,
            artists: v.artists?.map((a: any) => a.name).join(', ') ?? '',
            duration: v.duration?.text ?? undefined,
            thumbnail: this.getLargeThumbnail(v),
            videoId: v.id ?? undefined,
            type: 'video',
          });
        }
      }

      return items.slice(0, limit);
    } catch (err) {
      this.logger.error(`Music search failed for "${query}"`, err);
      return [];
    }
  }

  async getArtistTracks(
    artistName: string,
    limit = 10,
  ): Promise<YTMusicSearchResult[]> {
    const yt = await this.ensureInitialized();
    try {
      const results = await yt.music.search(artistName, { type: 'artist' });
      const artists = this.extractFromContents(results, 'artist');
      const artist = artists[0] as any;
      if (!artist) return [];

      const artistDetail = await yt.music.getArtist(artist.id);
      const sections = (artistDetail as any).sections ?? [];
      let songs: any[] = [];
      for (const sec of sections) {
        if (sec.contents) {
          for (const item of sec.contents) {
            if (item.type === 'MusicResponsiveListItem' && item.item_type === 'song') {
              songs.push(item);
            }
          }
        }
      }

      return songs.slice(0, limit).map((s: any) => ({
        id: s.id ?? '',
        title: s.title ?? '',
        artists: artistName,
        duration: s.duration?.text ?? undefined,
        thumbnail: this.getLargeThumbnail(s),
        videoId: s.id ?? undefined,
        type: 'song' as const,
      }));
    } catch (err) {
      this.logger.error(
        `Failed to fetch artist tracks for "${artistName}"`,
        err,
      );
      return [];
    }
  }

  async getRelatedTracks(
    videoId: string,
    limit = 10,
  ): Promise<YTMusicSearchResult[]> {
    const yt = await this.ensureInitialized();
    try {
      const related = await yt.music.getRelated(videoId);
      const allItems = this.extractFromContents(related);
      const items: YTMusicSearchResult[] = [];

      for (const r of allItems.slice(0, limit)) {
        const title = r.title ?? '';
        if (this.isNonMusic(title)) continue;

        items.push({
          id: r.id ?? '',
          title,
          artists: r.artists?.map((a: any) => a.name).join(', ') ?? '',
          thumbnail: this.getLargeThumbnail(r),
          videoId: r.id ?? undefined,
          type: 'song',
        });
      }

      return items;
    } catch (err) {
      this.logger.error(`Failed to fetch related tracks for ${videoId}`, err);
      return [];
    }
  }

  async getPlaylist(
    playlistId: string,
    limit = 50,
  ): Promise<YTMusicPlaylistTrack[]> {
    const yt = await this.ensureInitialized();
    try {
      const playlist = await yt.music.getPlaylist(playlistId);
      const tracks: YTMusicPlaylistTrack[] = [];

      for (const track of playlist.items) {
        if (!('title' in track)) continue;
        const title = (track as any).title ?? '';
        if (this.isNonMusic(title)) continue;

        tracks.push({
          id: (track as any).id ?? '',
          title,
          artists:
            (track as any).artists?.map((a: any) => a.name).join(', ') ?? '',
          album: (track as any).album?.name ?? undefined,
          duration: (track as any).duration?.text ?? undefined,
          thumbnail: this.getLargeThumbnail(track),
          videoId: (track as any).id ?? undefined,
        });
      }

      return tracks;
    } catch (err) {
      this.logger.error(`Failed to fetch playlist ${playlistId}`, err);
      return [];
    }
  }

  async getUserPlaylists(): Promise<YTMusicPlaylist[]> {
    const yt = await this.ensureInitialized();
    try {
      const lib = await yt.music.getLibrary();
      const playlists: YTMusicPlaylist[] = [];

      for (const shelf of lib.contents ?? []) {
        if ((shelf as any).contents) {
          for (const item of (shelf as any).contents) {
            const title = item.title ?? '';
            if (this.isNonMusicPlaylist(title)) continue;

            playlists.push({
              id: item.id ?? '',
              title,
              thumbnail: this.getLargeThumbnail(item),
              count: item.item_count ?? undefined,
              isOwned: true,
            });
          }
        }
      }

      return playlists;
    } catch (err) {
      this.logger.error('Failed to fetch user playlists', err);
      return [];
    }
  }

  private isNonMusic(title: string): boolean {
    return YouTubeMusicService.NON_MUSIC_PATTERNS.some((p) => p.test(title));
  }

  private isNonMusicPlaylist(title: string): boolean {
    return YouTubeMusicService.NON_MUSIC_PLAYLIST_PATTERNS.some((p) =>
      p.test(title),
    );
  }
}
