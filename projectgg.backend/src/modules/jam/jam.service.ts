import { Injectable, Inject, Logger } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import {
  JamSession,
  JamSettings,
  JamParticipant,
  JamQueueItem,
  JamTrack,
  JamState,
  DEFAULT_JAM_SETTINGS,
} from './jam.types';
import { randomBytes } from 'crypto';

@Injectable()
export class JamService {
  private readonly logger = new Logger(JamService.name);
  private sessions = new Map<string, JamSession>();
  private codeToId = new Map<string, string>();
  private userToSession = new Map<string, string>();

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  async getDisplayName(userId: string): Promise<string> {
    try {
      const { data } = await this.supabase
        .schema('projectgg')
        .from('users')
        .select('username')
        .eq('id', userId)
        .single();
      return data?.username || userId;
    } catch {
      return userId;
    }
  }

  private generateCode(): string {
    return randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
  }

  get_session_by_code(code: string): JamSession | undefined {
    const id = this.codeToId.get(code);
    return id ? this.sessions.get(id) : undefined;
  }

  get_session(id: string): JamSession | undefined {
    return this.sessions.get(id);
  }

  get_user_session(userId: string): JamSession | undefined {
    const sessionId = this.userToSession.get(userId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  create_session(
    hostUserId: string,
    hostName: string,
    persistent = false,
  ): JamSession {
    const existing = this.get_user_session(hostUserId);
    if (existing) this.leave_session(hostUserId);

    const id = randomBytes(12).toString('hex');
    const code = this.generateCode();

    const session: JamSession = {
      id,
      code,
      hostUserId,
      persistent,
      settings: { ...DEFAULT_JAM_SETTINGS },
      currentTrack: null,
      currentTime: 0,
      isPlaying: false,
      lastUpdated: Date.now(),
      participants: new Map(),
      queue: [],
      createdAt: Date.now(),
    };

    session.participants.set(hostUserId, {
      userId: hostUserId,
      displayName: hostName,
      isHost: true,
      joinedAt: Date.now(),
    });

    this.sessions.set(id, session);
    this.codeToId.set(code, id);
    this.userToSession.set(hostUserId, id);

    this.logger.log(`Jam session created: ${code} by ${hostUserId}`);
    return session;
  }

  join_session(
    code: string,
    userId: string,
    displayName: string,
  ): JamSession | null {
    const session = this.get_session_by_code(code);
    if (!session) return null;

    if (session.participants.size >= session.settings.maxParticipants)
      return null;

    const existing = this.get_user_session(userId);
    if (existing) this.leave_session(userId);

    session.participants.set(userId, {
      userId,
      displayName,
      isHost: false,
      joinedAt: Date.now(),
    });

    this.userToSession.set(userId, session.id);
    this.logger.log(`User ${userId} joined jam ${code}`);
    return session;
  }

  leave_session(
    userId: string,
  ): { sessionId: string; wasHost: boolean; newHostId: string | null } | null {
    const sessionId = this.userToSession.get(userId);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const participant = session.participants.get(userId);
    const wasHost = participant?.isHost ?? false;
    session.participants.delete(userId);
    this.userToSession.delete(userId);

    let newHostId: string | null = null;

    if (wasHost) {
      const remaining = Array.from(session.participants.values());
      if (remaining.length > 0) {
        remaining[0].isHost = true;
        newHostId = remaining[0].userId;
        session.hostUserId = newHostId;
        this.logger.log(
          `Host transferred to ${newHostId} in jam ${session.code}`,
        );
      } else {
        this.destroy_session(sessionId);
        return { sessionId, wasHost, newHostId: null };
      }
    }

    return { sessionId, wasHost, newHostId };
  }

  destroy_session(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const userId of session.participants.keys()) {
      this.userToSession.delete(userId);
    }

    this.codeToId.delete(session.code);
    this.sessions.delete(sessionId);
    this.logger.log(`Jam session destroyed: ${session.code}`);
  }

  is_host(userId: string, session: JamSession): boolean {
    return session.hostUserId === userId;
  }

  can_add_songs(userId: string, session: JamSession): boolean {
    return this.is_host(userId, session) || session.settings.anyoneCanAddSongs;
  }

  can_skip(userId: string, session: JamSession): boolean {
    return this.is_host(userId, session) || session.settings.anyoneCanSkip;
  }

  can_play_pause(userId: string, session: JamSession): boolean {
    return this.is_host(userId, session) || session.settings.anyoneCanPlayPause;
  }

  update_settings(
    userId: string,
    settings: Partial<JamSettings>,
  ): JamSettings | null {
    const session = this.get_user_session(userId);
    if (!session || !this.is_host(userId, session)) return null;

    session.settings = { ...session.settings, ...settings };
    return session.settings;
  }

  set_current_track(userId: string, track: JamTrack | null): JamSession | null {
    const session = this.get_user_session(userId);
    if (!session) return null;

    session.currentTrack = track;
    session.currentTime = 0;
    session.lastUpdated = Date.now();
    return session;
  }

  set_playing(
    userId: string,
    isPlaying: boolean,
    currentTime?: number,
  ): JamSession | null {
    const session = this.get_user_session(userId);
    if (!session) return null;

    session.isPlaying = isPlaying;
    if (currentTime !== undefined) session.currentTime = currentTime;
    session.lastUpdated = Date.now();
    return session;
  }

  seek_to(userId: string, time: number): JamSession | null {
    const session = this.get_user_session(userId);
    if (!session) return null;

    session.currentTime = time;
    session.lastUpdated = Date.now();
    return session;
  }

  add_to_queue(
    userId: string,
    track: JamTrack,
  ): { session: JamSession; item: JamQueueItem } | null {
    const session = this.get_user_session(userId);
    if (!session) return null;

    const item: JamQueueItem = {
      ...track,
      addedBy: userId,
      position: session.queue.length,
    };

    session.queue.push(item);
    return { session, item };
  }

  remove_from_queue(userId: string, position: number): JamSession | null {
    const session = this.get_user_session(userId);
    if (!session) return null;

    session.queue.splice(position, 1);
    session.queue.forEach((item, i) => (item.position = i));
    return session;
  }

  play_from_queue(
    userId: string,
    position: number,
  ): { session: JamSession; track: JamTrack } | null {
    const session = this.get_user_session(userId);
    if (!session) return null;
    if (position < 0 || position >= session.queue.length) return null;

    const item = session.queue.splice(position, 1)[0];
    session.queue.forEach((q, i) => (q.position = i));

    session.currentTrack = {
      videoId: item.videoId,
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
    };
    session.currentTime = 0;
    session.isPlaying = true;
    session.lastUpdated = Date.now();

    return { session, track: session.currentTrack };
  }

  next_track(
    userId: string,
  ): { session: JamSession; track: JamTrack | null } | null {
    const session = this.get_user_session(userId);
    if (!session) return null;

    if (session.queue.length === 0) {
      session.currentTrack = null;
      session.isPlaying = false;
    } else {
      const next = session.queue.shift()!;
      session.queue.forEach((item, i) => (item.position = i));
      session.currentTrack = {
        videoId: next.videoId,
        title: next.title,
        artist: next.artist,
        thumbnail: next.thumbnail,
      };
      session.currentTime = 0;
    }

    session.lastUpdated = Date.now();
    return { session, track: session.currentTrack };
  }

  to_state(session: JamSession): JamState {
    return {
      id: session.id,
      code: session.code,
      hostUserId: session.hostUserId,
      persistent: session.persistent,
      settings: session.settings,
      currentTrack: session.currentTrack,
      currentTime: session.isPlaying
        ? session.currentTime + (Date.now() - session.lastUpdated) / 1000
        : session.currentTime,
      isPlaying: session.isPlaying,
      participants: Array.from(session.participants.values()),
      queue: session.queue,
    };
  }

  get_adjusted_time(session: JamSession): number {
    if (!session.isPlaying) return session.currentTime;
    return session.currentTime + (Date.now() - session.lastUpdated) / 1000;
  }

  async persist_session(session: JamSession): Promise<void> {
    if (!session.persistent) return;

    try {
      const { error: upsertErr } = await this.supabase
        .schema('projectgg')
        .from('jam_sessions')
        .upsert(
          {
            id: session.id,
            code: session.code,
            host_user_id: session.hostUserId,
            persistent: session.persistent,
            settings: session.settings,
            current_track: session.currentTrack,
            current_time: session.currentTime,
            is_playing: session.isPlaying,
            last_updated: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (upsertErr)
        this.logger.error('Failed to persist jam session', upsertErr);
    } catch (e) {
      this.logger.error('persist_session error', e);
    }
  }
}
