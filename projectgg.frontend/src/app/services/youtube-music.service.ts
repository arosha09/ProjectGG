import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

@Injectable({
  providedIn: 'root'
})
export class YouTubeMusicService {
  private readonly apiUrl = `${environment.apiUrl}/youtube-music`;

  constructor(private http: HttpClient) {}

  search(query: string, limit = 20): Observable<YTMusicSearchResult[]> {
    return this.http.get<YTMusicSearchResult[]>(`${this.apiUrl}/search`, {
      params: { q: query, limit: limit.toString() },
    });
  }

  getPlaylist(playlistId: string, limit = 50): Observable<YTMusicPlaylistTrack[]> {
    return this.http.get<YTMusicPlaylistTrack[]>(`${this.apiUrl}/playlist/${playlistId}`, {
      params: { limit: limit.toString() },
    });
  }

  getUserPlaylists(): Observable<YTMusicPlaylist[]> {
    return this.http.get<YTMusicPlaylist[]>(`${this.apiUrl}/library/playlists`);
  }

  getArtistTracks(artistName: string, limit = 10): Observable<YTMusicSearchResult[]> {
    return this.http.get<YTMusicSearchResult[]>(
      `${this.apiUrl}/artist/${encodeURIComponent(artistName)}/tracks`,
      { params: { limit: limit.toString() } },
    );
  }

  getRelated(videoId: string, limit = 10): Observable<YTMusicSearchResult[]> {
    return this.http.get<YTMusicSearchResult[]>(`${this.apiUrl}/related/${videoId}`, {
      params: { limit: limit.toString() },
    });
  }
}
