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
          generate_session_locally: true,
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

  async searchMusic(query: string, limit = 10): Promise<YTMusicSearchResult[]> {
    const yt = await this.ensureInitialized();
    try {
      const results = await yt.music.search(query, { type: 'song' });
      const songs = results.songs;
      if (!songs) return [];

      const items: YTMusicSearchResult[] = [];
      for (const item of songs.contents.slice(0, limit)) {
        const title = item.title ?? '';
        if (this.isNonMusic(title)) continue;

        items.push({
          id: item.id ?? '',
          title,
          artists: item.artists?.map((a: any) => a.name).join(', ') ?? '',
          album: item.album?.name ?? undefined,
          duration: item.duration?.text ?? undefined,
          thumbnail: item.thumbnails?.[0]?.url ?? undefined,
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

      // Songs
      const songs = results.songs;
      if (songs) {
        for (const s of songs.contents.slice(0, limit)) {
          const title = s.title ?? '';
          if (this.isNonMusic(title)) continue;
          items.push({
            id: s.id ?? '',
            title,
            artists: s.artists?.map((a: any) => a.name).join(', ') ?? '',
            album: s.album?.name ?? undefined,
            duration: s.duration?.text ?? undefined,
            thumbnail: s.thumbnails?.[0]?.url ?? undefined,
            videoId: s.id ?? undefined,
            type: 'song',
          });
        }
      }

      // Videos (fill remaining slots)
      if (items.length < limit) {
        const videos = results.videos;
        if (videos) {
          for (const v of videos.contents.slice(0, limit - items.length)) {
            const title = v.title ?? '';
            if (this.isNonMusic(title)) continue;
            items.push({
              id: v.id ?? '',
              title,
              artists: v.artists?.map((a: any) => a.name).join(', ') ?? '',
              duration: v.duration?.text ?? undefined,
              thumbnail: v.thumbnails?.[0]?.url ?? undefined,
              videoId: v.id ?? undefined,
              type: 'video',
            });
          }
        }
      }

      return items.slice(0, limit);
    } catch (err) {
      this.logger.error(`Music search failed for "${query}"`, err);
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
          thumbnail: (track as any).thumbnails?.[0]?.url ?? undefined,
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
              thumbnail: item.thumbnails?.[0]?.url ?? undefined,
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

  async getArtistTracks(
    artistName: string,
    limit = 10,
  ): Promise<YTMusicSearchResult[]> {
    const yt = await this.ensureInitialized();
    try {
      const results = await yt.music.search(artistName, { type: 'artist' });
      const artist = results.artists?.contents[0] as any;
      if (!artist) return [];

      const artistId = artist.id;
      const artistDetail = await yt.music.getArtist(artistId);
      const songs = (artistDetail as any).songs ?? [];

      return songs.slice(0, limit).map((s: any) => ({
        id: s.id ?? '',
        title: s.title ?? '',
        artists: artistName,
        duration: s.duration?.text ?? undefined,
        thumbnail: s.thumbnails?.[0]?.url ?? undefined,
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
      const items: YTMusicSearchResult[] = [];

      if ('contents' in related) {
        for (const r of (related as any).contents?.slice(0, limit) ?? []) {
          const title = r.title ?? '';
          if (this.isNonMusic(title)) continue;

          items.push({
            id: r.id ?? '',
            title,
            artists: r.artists?.map((a: any) => a.name).join(', ') ?? '',
            thumbnail: r.thumbnails?.[0]?.url ?? undefined,
            videoId: r.id ?? undefined,
            type: 'song',
          });
        }
      }

      return items;
    } catch (err) {
      this.logger.error(`Failed to fetch related tracks for ${videoId}`, err);
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
