export interface JamTrack {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
}

export interface JamSettings {
  anyoneCanAddSongs: boolean;
  anyoneCanSkip: boolean;
  anyoneCanPlayPause: boolean;
  maxParticipants: number;
}

export const DEFAULT_JAM_SETTINGS: JamSettings = {
  anyoneCanAddSongs: true,
  anyoneCanSkip: true,
  anyoneCanPlayPause: true,
  maxParticipants: 10,
};

export interface JamParticipant {
  userId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: number;
}

export interface JamQueueItem extends JamTrack {
  addedBy: string;
  position: number;
}

export interface JamSession {
  id: string;
  code: string;
  hostUserId: string;
  persistent: boolean;
  settings: JamSettings;
  currentTrack: JamTrack | null;
  currentTime: number;
  isPlaying: boolean;
  lastUpdated: number;
  participants: Map<string, JamParticipant>;
  queue: JamQueueItem[];
  createdAt: number;
}

export interface JamState {
  id: string;
  code: string;
  hostUserId: string;
  persistent: boolean;
  settings: JamSettings;
  currentTrack: JamTrack | null;
  currentTime: number;
  isPlaying: boolean;
  participants: JamParticipant[];
  queue: JamQueueItem[];
}
