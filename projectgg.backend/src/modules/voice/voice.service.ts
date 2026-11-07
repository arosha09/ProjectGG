import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private client: any = null;
  private connections = new Map<string, any>(); // guildId -> VoiceConnection
  private audioPlayers = new Map<string, any>(); // guildId -> AudioPlayer
  private audioQueue = new Map<string, any[]>(); // guildId -> queued audio frames

  private initPromise: Promise<void> | null = null;
  private botToken: string | null = null;

  constructor(configService: ConfigService) {
    this.botToken = configService.get<string>('DISCORD_BOT_TOKEN') ?? null;
    if (!this.botToken) {
      this.logger.warn('DISCORD_BOT_TOKEN not set — voice unavailable');
    }
  }

  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;
    if (!this.botToken) throw new Error('Voice bot token not configured');
    if (!this.initPromise) {
      this.initPromise = this.initClient(this.botToken).catch((e) => {
        this.initPromise = null;
        throw e;
      });
    }
    await this.initPromise;
    return this.client;
  }

  private async initClient(token: string): Promise<void> {
    const { Client, GatewayIntentBits } = await import('discord.js');
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    this.client.on('clientReady', () => {
      this.logger.log(`Voice bot logged in as ${this.client.user?.tag}`);
    });
    await this.client.login(token);
  }

  get isReady(): boolean {
    return this.client !== null && this.client.isReady();
  }

  async joinChannel(guildId: string, channelId: string): Promise<void> {
    if (!guildId) {
      this.logger.log(
        `Joined voice channel ${channelId} (GG Chat — no Discord guild)`,
      );
      return;
    }

    await this.ensureClient();

    if (this.connections.has(guildId)) {
      const existing = this.connections.get(guildId);
      if (existing.joinConfig.channelId === channelId) return;
      existing.destroy();
      this.connections.delete(guildId);
      this.audioPlayers.delete(guildId);
    }

    try {
      const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior } =
        await import('@discordjs/voice');
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) throw new Error(`Guild ${guildId} not found`);

      const connection = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
      });

      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play },
      });
      connection.subscribe(player);

      this.connections.set(guildId, connection);
      this.audioPlayers.set(guildId, player);
      this.audioQueue.set(guildId, []);

      connection.on('stateChange', (oldState: any, newState: any) => {
        if (newState.status === 'disconnected') {
          this.connections.delete(guildId);
          this.audioPlayers.delete(guildId);
          this.audioQueue.delete(guildId);
        }
      });

      this.logger.log(`Joined voice channel ${channelId} in guild ${guildId}`);
    } catch (e) {
      this.logger.error(`Failed to join voice channel ${channelId}:`, e);
    }
  }

  async leaveChannel(guildId: string): Promise<void> {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
      this.audioPlayers.delete(guildId);
      this.audioQueue.delete(guildId);
    }
  }

  async playAudio(guildId: string, opusBuffer: Buffer): Promise<void> {
    const player = this.audioPlayers.get(guildId);
    if (!player) return;

    try {
      const { createAudioResource, StreamType } =
        await import('@discordjs/voice');
      const { Readable } = await import('stream');

      const stream = new Readable({
        read() {
          this.push(opusBuffer);
          this.push(null);
        },
      });

      const resource = createAudioResource(stream, {
        inputType: StreamType.Opus,
      });
      player.play(resource);
    } catch (e) {
      this.logger.error('Failed to play audio:', e);
    }
  }

  getVoiceConnection(guildId: string): any {
    return this.connections.get(guildId) ?? null;
  }

  getActiveGuilds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Track an incoming call for a user.
   * Called when a voice invite is sent - stored in database for persistence.
   */
  async setIncomingCall(
    userId: string,
    callData: {
      fromUserId: string;
      fromUsername: string;
      guildId: string;
      channelId: string;
    },
  ): Promise<void> {
    // Store in database with 5-minute expiration
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    await this.supabase
      .schema('projectgg')
      .from('incoming_voice_calls')
      .insert({
        recipient_id: userId,
        from_user_id: callData.fromUserId,
        from_username: callData.fromUsername,
        guild_id: callData.guildId,
        channel_id: callData.channelId,
        expires_at: expiresAt.toISOString(),
      });
  }

  /**
   * Get and clear the incoming call for a user.
   * Called by the game client to check for incoming calls.
   * Returns null if no pending call exists.
   */
  async getIncomingCall(userId: string):
    | { fromUserId: string; fromUsername: string; guildId: string; channelId: string }
    | null {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('incoming_voice_calls')
      .select('from_user_id, from_username, guild_id, channel_id')
      .eq('recipient_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Delete the call (consume it)
    await this.supabase
      .schema('projectgg')
      .from('incoming_voice_calls')
      .delete()
      .eq('recipient_id', userId);

    return {
      fromUserId: data.from_user_id,
      fromUsername: data.from_username,
      guildId: data.guild_id,
      channelId: data.channel_id,
    };
  }
}
