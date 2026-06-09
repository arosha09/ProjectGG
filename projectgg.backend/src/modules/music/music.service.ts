import { Injectable, Inject, Logger } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

export interface PlaylistDto {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
}

export interface PlaylistTrackDto {
  id: number;
  playlist_id: number;
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  position: number;
}

export interface PlaylistWithTracks extends PlaylistDto {
  tracks: PlaylistTrackDto[];
}

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  async getPlaylists(userId: string): Promise<PlaylistWithTracks[]> {
    try {
      const { data: playlists, error: plError } = await this.supabase
        .schema('projectgg')
        .from('user_playlists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (plError) {
        this.logger.warn(
          `getPlaylists query error (table may not exist): ${plError.message}`,
        );
        return [];
      }

      const result: PlaylistWithTracks[] = [];
      for (const pl of playlists ?? []) {
        const { data: tracks } = await this.supabase
          .schema('projectgg')
          .from('user_playlist_tracks')
          .select('*')
          .eq('playlist_id', pl.id)
          .order('position', { ascending: true });
        result.push({ ...pl, tracks: tracks ?? [] });
      }
      return result;
    } catch (err: any) {
      this.logger.warn(
        `getPlaylists fallback (table may not exist): ${err.message}`,
      );
      return [];
    }
  }

  async createPlaylist(
    userId: string,
    name: string,
  ): Promise<PlaylistDto | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    try {
      const { data, error } = await this.supabase
        .schema('projectgg')
        .from('user_playlists')
        .insert({ user_id: userId, name: trimmed })
        .select()
        .single();

      if (error) {
        this.logger.warn(`createPlaylist error: ${error.message}`);
        return null;
      }
      return data;
    } catch (err: any) {
      this.logger.warn(`createPlaylist fallback: ${err.message}`);
      return null;
    }
  }

  async savePlaylistTracks(
    userId: string,
    name: string,
    tracks: PlaylistTrackInput[],
  ): Promise<PlaylistWithTracks | null> {
    const trimmed = name.trim();
    if (!trimmed || !tracks.length) return null;

    try {
      const { data: existing } = await this.supabase
        .schema('projectgg')
        .from('user_playlists')
        .select('*')
        .eq('user_id', userId)
        .eq('name', trimmed)
        .maybeSingle();

      let playlistId: number;
      if (existing) {
        playlistId = existing.id;
        await this.supabase
          .schema('projectgg')
          .from('user_playlist_tracks')
          .delete()
          .eq('playlist_id', playlistId);
      } else {
        const created = await this.createPlaylist(userId, trimmed);
        if (!created) return null;
        playlistId = created.id;
      }

      const trackRows = tracks.map((t, i) => ({
        playlist_id: playlistId,
        video_id: t.videoId,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        position: i,
      }));

      const { data: inserted, error } = await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .insert(trackRows)
        .select()
        .order('position', { ascending: true });

      if (error) {
        this.logger.warn(`savePlaylistTracks error: ${error.message}`);
        return null;
      }

      return {
        id: playlistId,
        user_id: userId,
        name: trimmed,
        created_at: existing?.created_at ?? new Date().toISOString(),
        tracks: inserted ?? [],
      };
    } catch (err: any) {
      this.logger.warn(`savePlaylistTracks fallback: ${err.message}`);
      return null;
    }
  }

  async addTrackToPlaylist(
    playlistId: number,
    track: PlaylistTrackInput,
  ): Promise<boolean> {
    try {
      const { data: existing } = await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .select('*')
        .eq('playlist_id', playlistId)
        .eq('video_id', track.videoId)
        .maybeSingle();

      if (existing) return true;

      const { data: maxPos } = await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPos = (maxPos?.position ?? -1) + 1;
      const { error } = await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .insert({
          playlist_id: playlistId,
          video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
          position: nextPos,
        });

      if (error) {
        this.logger.warn(`addTrackToPlaylist error: ${error.message}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async removeTrackFromPlaylist(
    playlistId: number,
    trackIndex: number,
  ): Promise<boolean> {
    try {
      const { data: tracks, error: selError } = await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .select('id')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (selError || !tracks || trackIndex >= tracks.length) return false;

      const { error } = await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .delete()
        .eq('id', tracks[trackIndex].id);

      if (error) {
        this.logger.warn(`removeTrackFromPlaylist error: ${error.message}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async deletePlaylist(playlistId: number): Promise<boolean> {
    try {
      await this.supabase
        .schema('projectgg')
        .from('user_playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId);

      const { error } = await this.supabase
        .schema('projectgg')
        .from('user_playlists')
        .delete()
        .eq('id', playlistId);

      if (error) {
        this.logger.warn(`deletePlaylist error: ${error.message}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}

export interface PlaylistTrackInput {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
}
