import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

export interface PlatformConnection {
  id: number;
  user_id: string;
  platform: string;
  type?: string;
  platform_user_id: string | null;
  platform_username: string | null;
  access_token: string | null;
  refresh_token: string | null;
  connected_at: string;
  last_synced_at: string | null;
}

@Injectable()
export class PlatformConnectionsService {
  private readonly steamApiKey: string;
  private readonly discordClientId: string;
  private readonly discordClientSecret: string;
  private readonly discordBotToken: string;
  private readonly discordGuildId: string;
  private readonly spotifyClientId: string;
  private readonly spotifyClientSecret: string;
  private readonly googleClientId: string;
  private readonly googleClientSecret: string;
  private readonly appleMusicKeyId: string;
  private readonly appleMusicTeamId: string;
  private readonly appleMusicServiceId: string;
  private readonly appleMusicPrivateKey: string;
  private readonly frontendUrl: string;
  private readonly youtubeApiKey: string;
  private _tableSchema: string | null = null;

  // Temporary state store for OAuth flows
  private readonly stateStore = new Map<
    string,
    { userId: string; expiresAt: Date; redirectUri?: string }
  >();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    configService: ConfigService,
  ) {
    this.steamApiKey = configService.get<string>('STEAM_API_KEY') ?? '';
    this.discordClientId = configService.get<string>('DISCORD_CLIENT_ID') ?? '';
    this.discordClientSecret =
      configService.get<string>('DISCORD_CLIENT_SECRET') ?? '';
    this.discordBotToken = configService.get<string>('DISCORD_BOT_TOKEN') ?? '';
    this.discordGuildId = configService.get<string>('DISCORD_GUILD_ID') ?? '';
    this.spotifyClientId = configService.get<string>('SPOTIFY_CLIENT_ID') ?? '';
    this.spotifyClientSecret =
      configService.get<string>('SPOTIFY_CLIENT_SECRET') ?? '';
    this.googleClientId = configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.googleClientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    this.appleMusicKeyId =
      configService.get<string>('APPLE_MUSIC_KEY_ID') ?? '';
    this.appleMusicTeamId =
      configService.get<string>('APPLE_MUSIC_TEAM_ID') ?? '';
    this.appleMusicServiceId =
      configService.get<string>('APPLE_MUSIC_SERVICE_ID') ?? '';
    this.appleMusicPrivateKey =
      configService.get<string>('APPLE_MUSIC_PRIVATE_KEY') ?? '';
    this.frontendUrl =
      configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    this.youtubeApiKey = configService.get<string>('YOUTUBE_API_KEY') ?? '';
  }

  private cleanupExpiredStates(): void {
    const now = new Date();
    for (const [key, val] of this.stateStore) {
      if (val.expiresAt < now) this.stateStore.delete(key);
    }
  }

  private pc() {
    return this.supabase.schema('projectgg').from('user_platform_connections');
  }

  // ============================================================
  // GET all connections for a user
  // ============================================================
  async getConnections(userId: string): Promise<PlatformConnection[]> {
    const db = await this.pc();
    const { data, error } = await db.select('*').eq('user_id', userId);
    if (error) {
      console.error('getConnections error:', error);
      throw error;
    }
    return data ?? [];
  }

  // ============================================================
  // LINK / UNLINK
  // ============================================================
  private readonly validPlatforms = [
    'steam',
    'discord',
    'gog',
    'epic',
    'ubisoft',
    'ea',
    'spotify',
    'youtube_music',
    'apple_music',
  ] as const;

  async manualLink(
    userId: string,
    platform: string,
    username: string,
  ): Promise<void> {
    if (!this.validPlatforms.includes(platform as any)) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
    const db = await this.pc();
    const { error } = await db.upsert(
      {
        user_id: userId,
        platform,
        type: 'accounts',
        platform_username: username,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    );
    if (error) throw error;
  }

  async unlink(userId: string, platform: string): Promise<void> {
    const db = await this.pc();
    const { error } = await db
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform);
    if (error) throw error;
  }

  // ============================================================
  // STEAM OPENID
  // ============================================================
  getSteamAuthUrl(userId: string): { url: string } {
    this.cleanupExpiredStates();
    const state = crypto.randomUUID();
    this.stateStore.set(state, {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const callbackUrl = `${this.frontendUrl}/auth/steam/callback?state=${state}`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': callbackUrl,
      'openid.realm': this.frontendUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return {
      url: `https://steamcommunity.com/openid/login?${params.toString()}`,
    };
  }

  async handleSteamCallback(
    state: string,
    openidParams: Record<string, string>,
  ): Promise<PlatformConnection> {
    const stateData = this.stateStore.get(state);
    if (!stateData) throw new UnauthorizedException('Invalid or expired state');
    if (stateData.expiresAt < new Date()) {
      this.stateStore.delete(state);
      throw new UnauthorizedException('State expired — try again');
    }
    this.stateStore.delete(state);
    const userId = stateData.userId;

    const claimedId = openidParams['openid.claimed_id'];
    if (!claimedId)
      throw new BadRequestException('Missing Steam ID in response');
    const steamId = claimedId.split('/').pop();
    if (!steamId || !/^\d{17}$/.test(steamId))
      throw new BadRequestException('Invalid Steam ID format');

    const isValid = await this.validateSteamResponse(openidParams);
    if (!isValid)
      throw new UnauthorizedException('Steam authentication validation failed');

    const profile = await this.fetchSteamProfile(steamId);

    const db = await this.pc();
    const { data, error } = await db
      .upsert(
        {
          user_id: userId,
          platform: 'steam',
          type: 'accounts',
          platform_user_id: steamId,
          platform_username: profile?.personaname ?? null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  private async validateSteamResponse(
    params: Record<string, string>,
  ): Promise<boolean> {
    try {
      const body = new URLSearchParams({
        'openid.assoc_handle': params['openid.assoc_handle'] ?? '',
        'openid.signed': params['openid.signed'] ?? '',
        'openid.sig': params['openid.sig'] ?? '',
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'check_authentication',
      });
      const signed = (params['openid.signed'] ?? '').split(',');
      for (const field of signed) {
        const val = params[`openid.${field}`];
        if (val) body.append(`openid.${field}`, val);
      }
      const res = await fetch('https://steamcommunity.com/openid/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const text = await res.text();
      return text.includes('is_valid:true');
    } catch {
      return false;
    }
  }

  private async fetchSteamProfile(steamId: string): Promise<any> {
    if (!this.steamApiKey) return null;
    try {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.steamApiKey}&steamids=${steamId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data: any = await res.json();
      return data?.response?.players?.[0] ?? null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // IMPORT STEAM LIBRARY
  // ============================================================
  async importSteamLibrary(
    userId: string,
  ): Promise<{ imported: number; total: number }> {
    const db = await this.pc();
    const { data: conn } = await db
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'steam')
      .single();
    if (!conn) throw new BadRequestException('Steam account not linked');
    if (!this.steamApiKey)
      throw new BadRequestException('Steam API key not configured');

    const steamId = conn.platform_user_id;
    if (!steamId) throw new BadRequestException('No Steam ID found');

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${this.steamApiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException('Failed to fetch Steam library');

    const data: any = await res.json();
    const games: any[] = data?.response?.games ?? [];
    let imported = 0;

    for (const game of games) {
      try {
        const name = game.name;
        if (!name) continue;
        const appId = game.appid;
        const code = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const { data: existing } = await this.supabase
          .schema('projectgg')
          .from('games_master')
          .select('code')
          .eq('code', code)
          .single();
        if (!existing) {
          await this.supabase.rpc('create_game_from_external', {
            in_name: name,
            in_code: code,
            in_desc: null,
            in_cover_url: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
            in_genres: null,
            in_external_id: String(appId),
            in_rating: null,
            in_sequence_release: null,
            in_is_series: false,
            in_series_name: null,
            in_platforms: ['pc'],
            in_sources: ['steam'],
          });
        }

        const { data: linked } = await this.supabase
          .schema('projectgg')
          .from('user_games')
          .select('code')
          .eq('user_id', userId)
          .eq('game_code', code)
          .single();
        if (!linked) {
          await this.supabase
            .schema('projectgg')
            .from('user_games')
            .insert({ user_id: userId, game_code: code, game_status: 'owned' });
        }
        imported++;
      } catch {
        /* skip individual failures */
      }
    }

    const db2 = await this.pc();
    await db2
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'steam');

    return { imported, total: games.length };
  }

  // ============================================================
  // DISCORD OAUTH2
  // ============================================================
  getDiscordAuthUrl(userId: string): { url: string } {
    this.cleanupExpiredStates();
    const state = crypto.randomUUID();
    this.stateStore.set(state, {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    if (!this.discordClientId)
      throw new BadRequestException('Discord client ID not configured');

    const redirectUri = `${this.frontendUrl}/auth/discord/callback`;
    const params = new URLSearchParams({
      client_id: this.discordClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds.join',
      state,
    });
    return { url: `https://discord.com/oauth2/authorize?${params.toString()}` };
  }

  async handleDiscordCallback(
    state: string,
    code: string,
  ): Promise<PlatformConnection> {
    const stateData = this.stateStore.get(state);
    if (!stateData) throw new UnauthorizedException('Invalid or expired state');
    if (stateData.expiresAt < new Date()) {
      this.stateStore.delete(state);
      throw new UnauthorizedException('State expired — try again');
    }
    this.stateStore.delete(state);
    const userId = stateData.userId;

    if (!this.discordClientId || !this.discordClientSecret) {
      throw new BadRequestException('Discord client not configured');
    }

    // Exchange code for token
    const tokenBody = new URLSearchParams({
      client_id: this.discordClientId,
      client_secret: this.discordClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${this.frontendUrl}/auth/discord/callback`,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
    } catch (e) {
      console.error('Discord token exchange fetch error:', e);
      throw new BadRequestException('Failed to exchange Discord code');
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Discord token exchange response error:', errText);
      throw new BadRequestException(
        `Discord token exchange failed: ${errText}`,
      );
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log('Discord token exchange succeeded, fetching user...');

    let userRes: Response;
    try {
      userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.error('Discord user fetch error:', e);
      throw new BadRequestException('Failed to fetch Discord user info');
    }

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error('Discord user fetch response error:', errText);
      throw new BadRequestException('Failed to fetch Discord profile');
    }
    const discordUser: any = await userRes.json();
    console.log('Discord user fetched:', discordUser.id, discordUser.username);

    const db = await this.pc();
    const { data, error } = await db
      .upsert(
        {
          user_id: userId,
          platform: 'discord',
          type: 'accounts',
          platform_user_id: discordUser.id,
          platform_username: discordUser.global_name ?? discordUser.username,
          access_token: accessToken,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' },
      )
      .select()
      .single();
    if (error) {
      console.error('Discord upsert error:', error);
      throw error;
    }
    console.log('Discord connection saved to DB');

    // Auto-join the ProjectGG guild if not already a member
    await this.addUserToGuild(discordUser.id, accessToken);

    return data;
  }

  private async addUserToGuild(
    discordUserId: string,
    userAccessToken: string,
  ): Promise<void> {
    if (!this.discordBotToken || !this.discordGuildId) return;
    try {
      const res = await fetch(
        `https://discord.com/api/guilds/${this.discordGuildId}/members/${discordUserId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${this.discordBotToken}`,
          },
          body: JSON.stringify({ access_token: userAccessToken }),
        },
      );
      if (res.ok) {
        console.log(`User ${discordUserId} added to guild`);
      } else if (res.status === 204 || res.status === 201) {
        console.log(`User ${discordUserId} already in guild`);
      } else {
        const text = await res.text();
        console.warn(`Failed to add user to guild (${res.status}): ${text}`);
      }
    } catch (e) {
      console.error('Error adding user to guild:', e);
    }
  }

  // ============================================================
  // SPOTIFY OAUTH2
  // ============================================================
  getSpotifyAuthUrl(userId: string, frontendOrigin?: string): { url: string } {
    this.cleanupExpiredStates();
    const state = crypto.randomUUID();
    const redirectUri = frontendOrigin
      ? `${frontendOrigin}/auth/spotify/callback`
      : `${this.frontendUrl}/auth/spotify/callback`;

    this.stateStore.set(state, {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      redirectUri,
    });

    if (!this.spotifyClientId)
      throw new BadRequestException('Spotify client ID not configured');

    const params = new URLSearchParams({
      client_id: this.spotifyClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'user-read-private user-read-email',
      state,
    });
    return {
      url: `https://accounts.spotify.com/authorize?${params.toString()}`,
    };
  }

  async handleSpotifyCallback(
    state: string,
    code: string,
  ): Promise<PlatformConnection> {
    const stateData = this.stateStore.get(state);
    if (!stateData) throw new UnauthorizedException('Invalid or expired state');
    if (stateData.expiresAt < new Date()) {
      this.stateStore.delete(state);
      throw new UnauthorizedException('State expired — try again');
    }
    this.stateStore.delete(state);
    const userId = stateData.userId;
    const redirectUri =
      stateData.redirectUri || `${this.frontendUrl}/auth/spotify/callback`;

    if (!this.spotifyClientId || !this.spotifyClientSecret)
      throw new BadRequestException('Spotify client not configured');

    const basicAuth = Buffer.from(
      `${this.spotifyClientId}:${this.spotifyClientSecret}`,
    ).toString('base64');

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenBody.toString(),
      });
    } catch {
      throw new BadRequestException('Failed to exchange Spotify code');
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Spotify token exchange error:', errText);
      throw new BadRequestException(`Spotify token exchange failed`);
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error('Spotify token response missing access token', tokenData);
      throw new BadRequestException('Spotify token exchange failed');
    }

    let userRes: Response;
    try {
      userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
    } catch {
      throw new BadRequestException('Failed to fetch Spotify profile');
    }

    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error('Spotify profile fetch error:', userRes.status, errorText);
      throw new BadRequestException('Failed to fetch Spotify profile');
    }

    const spotifyUser: any = await userRes.json();

    const db = await this.pc();
    const { data, error } = await db
      .upsert(
        {
          user_id: userId,
          platform: 'spotify',
          type: 'music',
          platform_user_id: spotifyUser.id,
          platform_username: spotifyUser.display_name ?? spotifyUser.id,
          access_token: accessToken,
          refresh_token: tokenData.refresh_token ?? null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ============================================================
  // YOUTUBE MUSIC OAUTH2 (Google OAuth)
  // ============================================================
  getYoutubeMusicAuthUrl(userId: string): { url: string } {
    this.cleanupExpiredStates();
    const state = crypto.randomUUID();
    this.stateStore.set(state, {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    if (!this.googleClientId)
      throw new BadRequestException('Google client ID not configured');

    const redirectUri = `${this.frontendUrl}/auth/youtube-music/callback`;
    const params = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  async handleYoutubeMusicCallback(
    state: string,
    code: string,
  ): Promise<PlatformConnection> {
    const stateData = this.stateStore.get(state);
    if (!stateData) throw new UnauthorizedException('Invalid or expired state');
    if (stateData.expiresAt < new Date()) {
      this.stateStore.delete(state);
      throw new UnauthorizedException('State expired — try again');
    }
    this.stateStore.delete(state);
    const userId = stateData.userId;

    if (!this.googleClientId || !this.googleClientSecret)
      throw new BadRequestException('Google client not configured');

    const tokenBody = new URLSearchParams({
      client_id: this.googleClientId,
      client_secret: this.googleClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${this.frontendUrl}/auth/youtube-music/callback`,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
    } catch {
      throw new BadRequestException('Failed to exchange Google code');
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Google token exchange error:', errText);
      throw new BadRequestException('Google token exchange failed');
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

    // Fetch YouTube channel info
    let channelRes: Response;
    try {
      channelRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch {
      throw new BadRequestException('Failed to fetch YouTube profile');
    }

    let platformUserId = '';
    let platformUsername = '';
    if (channelRes.ok) {
      const channelData: any = await channelRes.json();
      const channel = channelData?.items?.[0];
      if (channel) {
        platformUserId = channel.id;
        platformUsername = channel.snippet?.title ?? '';
      }
    }

    // Fallback: use Google token info
    if (!platformUserId) {
      try {
        const infoRes = await fetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`,
        );
        if (infoRes.ok) {
          const infoData: any = await infoRes.json();
          platformUserId = infoData.user_id ?? infoData.email ?? '';
          platformUsername = infoData.email ?? '';
        }
      } catch {}
    }

    const db = await this.pc();
    const { data, error } = await db
      .upsert(
        {
          user_id: userId,
          platform: 'youtube_music',
          type: 'music',
          platform_user_id: platformUserId,
          platform_username: platformUsername,
          access_token: accessToken,
          refresh_token: tokenData.refresh_token ?? null,
          connected_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: 'user_id,platform' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ============================================================
  // APPLE MUSIC OAUTH2 (MusicKit)
  // ============================================================
  private generateAppleDeveloperToken(): string {
    if (
      !this.appleMusicKeyId ||
      !this.appleMusicTeamId ||
      !this.appleMusicServiceId ||
      !this.appleMusicPrivateKey
    )
      throw new BadRequestException('Apple Music not fully configured');

    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'ES256',
      kid: this.appleMusicKeyId,
    };
    const payload = {
      iss: this.appleMusicTeamId,
      iat: now,
      exp: now + 15552000,
      sub: this.appleMusicServiceId,
    };

    const base64UrlEncode = (obj: any) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const headerB64 = base64UrlEncode(header);
    const payloadB64 = base64UrlEncode(payload);
    const toSign = `${headerB64}.${payloadB64}`;

    const crypto = require('crypto');
    const signature = crypto
      .sign('ES256', Buffer.from(toSign), this.appleMusicPrivateKey)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${toSign}.${signature}`;
  }

  getAppleMusicAuthUrl(userId: string): { url: string } {
    this.cleanupExpiredStates();
    const state = crypto.randomUUID();
    this.stateStore.set(state, {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    if (!this.appleMusicServiceId)
      throw new BadRequestException('Apple Music service ID not configured');

    const redirectUri = `${this.frontendUrl}/auth/apple-music/callback`;
    const params = new URLSearchParams({
      client_id: this.appleMusicServiceId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'music',
      state,
    });
    return {
      url: `https://appleid.apple.com/auth/authorize?${params.toString()}`,
    };
  }

  async handleAppleMusicCallback(
    state: string,
    code: string,
  ): Promise<PlatformConnection> {
    const stateData = this.stateStore.get(state);
    if (!stateData) throw new UnauthorizedException('Invalid or expired state');
    if (stateData.expiresAt < new Date()) {
      this.stateStore.delete(state);
      throw new UnauthorizedException('State expired — try again');
    }
    this.stateStore.delete(state);
    const userId = stateData.userId;

    if (
      !this.appleMusicServiceId ||
      !this.appleMusicKeyId ||
      !this.appleMusicTeamId ||
      !this.appleMusicPrivateKey
    )
      throw new BadRequestException('Apple Music not fully configured');

    const developerToken = this.generateAppleDeveloperToken();

    const tokenBody = new URLSearchParams({
      client_id: this.appleMusicServiceId,
      client_secret: developerToken,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${this.frontendUrl}/auth/apple-music/callback`,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
    } catch {
      throw new BadRequestException('Failed to exchange Apple Music code');
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Apple Music token exchange error:', errText);
      throw new BadRequestException('Apple Music token exchange failed');
    }

    const tokenData: any = await tokenRes.json();
    const userToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? null;

    // Fetch Apple Music profile (storefront + account info)
    let platformUserId = '';
    let platformUsername = '';
    try {
      const profileRes = await fetch(
        'https://api.music.apple.com/v1/me/storefront',
        {
          headers: {
            Authorization: `Bearer ${developerToken}`,
            'Music-User-Token': userToken,
          },
        },
      );
      if (profileRes.ok) {
        const profileData: any = await profileRes.json();
        const storefront = profileData?.data?.[0];
        if (storefront) {
          platformUserId = storefront.id;
          platformUsername = `Apple Music (${storefront.attributes?.name ?? storefront.id})`;
        }
      }
    } catch {
      // profile fetch failure is non-fatal
    }

    if (!platformUserId) platformUserId = userId;
    if (!platformUsername) platformUsername = 'Apple Music User';

    const db = await this.pc();
    const { data, error } = await db
      .upsert(
        {
          user_id: userId,
          platform: 'apple_music',
          type: 'music',
          platform_user_id: platformUserId,
          platform_username: platformUsername,
          access_token: userToken,
          refresh_token: refreshToken,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ============================================================
  // SPOTIFY — Currently Playing
  // ============================================================
  async getSpotifyCurrentlyPlaying(userId: string): Promise<any> {
    try {
      const db = await this.pc();
      const { data: conn } = await db
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'spotify')
        .single();

      if (!conn?.access_token) return null;

      let token = conn.access_token;
      const refreshTokenValue = conn.refresh_token;

      const doFetch = async (): Promise<any> => {
        const res = await fetch(
          'https://api.spotify.com/v1/me/player/currently-playing',
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.status === 204) return null;
        if (!res.ok) return null;

        const data: any = await res.json();
        if (!data?.item) return null;

        return {
          platform: 'spotify',
          track: data.item.name,
          artist: data.item.artists?.[0]?.name ?? 'Unknown',
          albumArt: data.item.album?.images?.[0]?.url ?? null,
          progressMs: data.progress_ms ?? 0,
          durationMs: data.item.duration_ms ?? 0,
          isPlaying: data.is_playing ?? false,
        };
      };

      const result = await doFetch();
      if (result) return result;

      // Token might be expired — try refresh
      if (refreshTokenValue) {
        const basicAuth = Buffer.from(
          `${this.spotifyClientId}:${this.spotifyClientSecret}`,
        ).toString('base64');

        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshTokenValue,
        });

        const refreshRes = await fetch(
          'https://accounts.spotify.com/api/token',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${basicAuth}`,
            },
            body: body.toString(),
          },
        );

        if (refreshRes.ok) {
          const refreshData: any = await refreshRes.json();
          token = refreshData.access_token;

          const db2 = await this.pc();
          await db2
            .update({ access_token: token })
            .eq('user_id', userId)
            .eq('platform', 'spotify');

          return await doFetch();
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // APPLE MUSIC — Most Recently Played
  // ============================================================
  async getAppleMusicCurrentlyPlaying(userId: string): Promise<any> {
    try {
      const db = await this.pc();
      const { data: conn } = await db
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'apple_music')
        .single();

      if (!conn?.access_token) return null;

      const developerToken = this.generateAppleDeveloperToken();
      const musicUserToken = conn.access_token;

      const res = await fetch(
        'https://api.music.apple.com/v1/me/recent/played/tracks',
        {
          headers: {
            Authorization: `Bearer ${developerToken}`,
            'Music-User-Token': musicUserToken,
          },
        },
      );

      if (!res.ok) return null;

      const data: any = await res.json();
      const track = data?.data?.[0]?.attributes;
      if (!track) return null;

      let artworkUrl = track.artwork?.url ?? null;
      if (artworkUrl) {
        artworkUrl = artworkUrl.replace('{w}x{h}', '300x300');
      }

      return {
        platform: 'apple_music',
        track: track.name,
        artist: track.artistName ?? 'Unknown',
        albumArt: artworkUrl,
        progressMs: 0,
        durationMs: track.durationInMillis ?? 0,
        isPlaying: true,
      };
    } catch {
      return null;
    }
  }

  // ============================================================
  // YOUTUBE MUSIC — Currently Playing (not available via API)
  // ============================================================
  async getYoutubeMusicCurrentlyPlaying(userId: string): Promise<any> {
    return null;
  }

  // ============================================================
  // YOUTUBE DATA API — Music Search (Free, No OAuth)
  // ============================================================
  async searchYoutubeTracks(query: string): Promise<any[]> {
    if (!query?.trim()) return [];
    if (!this.youtubeApiKey) return [];

    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('type', 'video');
      url.searchParams.set('videoCategoryId', '10');
      url.searchParams.set('videoDuration', 'medium');
      url.searchParams.set('maxResults', '15');
      url.searchParams.set('key', this.youtubeApiKey);

      // Boost music relevance by appending " music" to the query
      const boosted = query.trim().toLowerCase().endsWith(' music')
        ? query.trim()
        : `${query.trim()} music`;
      url.searchParams.set('q', boosted);

      const res = await fetch(url.toString());
      if (!res.ok) {
        console.error('YouTube search error:', res.status, await res.text());
        return [];
      }

      const data: any = await res.json();
      const blocklist = [
        'trailer',
        'gameplay',
        'tutorial',
        'review',
        'reaction',
        'podcast',
        'interview',
        'lofi',
        'remix',
        'instrumental',
      ];
      const isMusic = (title: string) => {
        const lower = title.toLowerCase();
        return !blocklist.some((w) => lower.includes(w));
      };

      return (data?.items ?? [])
        .filter((item: any) => isMusic(item.snippet?.title ?? ''))
        .map((item: any) => ({
          videoId: item.id?.videoId ?? '',
          title: item.snippet?.title ?? 'Unknown',
          artist: item.snippet?.channelTitle ?? 'Unknown',
          thumbnail:
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url ??
            null,
          channelId: item.snippet?.channelId ?? '',
          publishedAt: item.snippet?.publishedAt ?? '',
        }));
    } catch (err) {
      console.error('YouTube search fetch error:', err);
      return [];
    }
  }

  // ============================================================
  // YOUTUBE — User Playlists (via OAuth)
  // ============================================================
  async getYoutubeAccessToken(userId: string): Promise<string | null> {
    try {
      const db = await this.pc();
      const { data: conn } = await db
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'youtube_music')
        .single();

      if (!conn?.access_token) {
        console.warn(`[YT] No access_token in DB for user ${userId}`);
        return null;
      }

      let token = conn.access_token;
      const refreshTokenValue = conn.refresh_token;

      // Proactively refresh if token expires within 5 minutes
      const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
      const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
      const needsRefresh = expiresAt > 0 && expiresAt < fiveMinFromNow;

      if (!needsRefresh) {
        // Test if token works
        const testRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (testRes.ok) return token;
        console.warn(`[YT] Token expired for user ${userId} (test returned ${testRes.status}), attempting refresh...`);
      } else {
        console.log(`[YT] Token expiring soon for user ${userId}, proactively refreshing...`);
      }

      // Token expired or expiring — try refresh
      if (refreshTokenValue && this.googleClientId && this.googleClientSecret) {
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshTokenValue,
          client_id: this.googleClientId,
          client_secret: this.googleClientSecret,
        });

        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (refreshRes.ok) {
          const refreshData: any = await refreshRes.json();
          token = refreshData.access_token;
          const newExpiresAt = new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString();

          const db2 = await this.pc();
          await db2
            .update({ access_token: token, expires_at: newExpiresAt })
            .eq('user_id', userId)
            .eq('platform', 'youtube_music');

          console.log(`[YT] Token refreshed successfully for user ${userId}`);
          return token;
        } else {
          const refreshErr = await refreshRes.text();
          console.error(`[YT] Token refresh failed for user ${userId} (${refreshRes.status}):`, refreshErr);
        }
      } else {
        if (!refreshTokenValue) console.warn(`[YT] No refresh_token for user ${userId}`);
        if (!this.googleClientId) console.warn(`[YT] GOOGLE_CLIENT_ID not configured`);
        if (!this.googleClientSecret) console.warn(`[YT] GOOGLE_CLIENT_SECRET not configured`);
      }

      return null;
    } catch (err) {
      console.error(`[YT] getYoutubeAccessToken error for user ${userId}:`, err);
      return null;
    }
  }

  async getYoutubePlaylists(userId: string): Promise<any[]> {
    const token = await this.getYoutubeAccessToken(userId);
    if (!token) {
      console.warn(`[YT] No valid token for user ${userId} — playlists skipped`);
      return [];
    }

    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
      url.searchParams.set('part', 'snippet,contentDetails');
      url.searchParams.set('mine', 'true');
      url.searchParams.set('maxResults', '50');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[YT] Playlists API error ${res.status}:`, errBody);
        return [];
      }
      const data: any = await res.json();

      return (data?.items ?? []).map((item: any) => ({
        id: item.id,
        title: item.snippet?.title ?? 'Untitled',
        description: item.snippet?.description ?? '',
        thumbnail:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        trackCount: item.contentDetails?.itemCount ?? 0,
        channelTitle: item.snippet?.channelTitle ?? '',
      }));
    } catch (err) {
      console.error('[YT] YouTube playlists fetch error:', err);
      return [];
    }
  }

  async getYoutubePlaylistTracks(
    userId: string,
    playlistId: string,
  ): Promise<any[]> {
    const token = await this.getYoutubeAccessToken(userId);
    if (!token) return [];

    try {
      const tracks: any[] = [];
      let pageToken = '';

      // Fetch up to 200 tracks (4 pages of 50)
      for (let i = 0; i < 4; i++) {
        const url = new URL(
          'https://www.googleapis.com/youtube/v3/playlistItems',
        );
        url.searchParams.set('part', 'snippet,contentDetails');
        url.searchParams.set('playlistId', playlistId);
        url.searchParams.set('maxResults', '50');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) break;
        const data: any = await res.json();

        for (const item of data?.items ?? []) {
          const snippet = item.snippet;
          const contentDetails = item.contentDetails;
          if (!snippet) continue;

          tracks.push({
            videoId:
              contentDetails?.videoId ?? snippet.resourceId?.videoId ?? '',
            title: snippet.title ?? 'Unknown',
            artist: snippet.channelTitle ?? 'Unknown',
            thumbnail:
              snippet.thumbnails?.high?.url ??
              snippet.thumbnails?.medium?.url ??
              snippet.thumbnails?.default?.url ??
              null,
          });
        }

        pageToken = data?.nextPageToken ?? '';
        if (!pageToken) break;
      }

      return tracks.filter((t) => t.videoId);
    } catch (err) {
      console.error('YouTube playlist tracks fetch error:', err);
      return [];
    }
  }

  // ============================================================
  // UNIFIED — Music Currently Playing
  // ============================================================
  async getMusicCurrentlyPlaying(
    userId: string,
    platform?: string,
  ): Promise<any> {
    if (platform) {
      switch (platform) {
        case 'spotify':
          return this.getSpotifyCurrentlyPlaying(userId);
        case 'apple_music':
          return this.getAppleMusicCurrentlyPlaying(userId);
        case 'youtube_music':
          return this.getYoutubeMusicCurrentlyPlaying(userId);
        default:
          return null;
      }
    }

    return (
      (await this.getSpotifyCurrentlyPlaying(userId)) ??
      (await this.getAppleMusicCurrentlyPlaying(userId)) ??
      (await this.getYoutubeMusicCurrentlyPlaying(userId))
    );
  }

  // ============================================================
  // MUSIC CONNECTIONS
  // ============================================================
  async getMusicConnections(userId: string): Promise<any[]> {
    try {
      const db = await this.pc();
      const { data } = await db
        .select('platform, connected_at')
        .eq('user_id', userId)
        .in('platform', ['spotify', 'youtube_music', 'apple_music']);

      const allPlatforms = [
        { id: 'spotify', name: 'Spotify' },
        { id: 'youtube_music', name: 'YouTube Music' },
        { id: 'apple_music', name: 'Apple Music' },
      ];

      return allPlatforms.map((p) => ({
        ...p,
        connected: (data ?? []).some((d: any) => d.platform === p.id),
      }));
    } catch {
      return [];
    }
  }
}
