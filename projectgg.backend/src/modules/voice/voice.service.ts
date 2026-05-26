import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private client: any = null;
  private connections = new Map<string, any>(); // guildId -> VoiceConnection
  private audioPlayers = new Map<string, any>(); // guildId -> AudioPlayer
  private audioQueue = new Map<string, any[]>(); // guildId -> queued audio frames

  constructor(configService: ConfigService) {
    const token = configService.get<string>('DISCORD_BOT_TOKEN');
    if (!token) {
      this.logger.warn('DISCORD_BOT_TOKEN not set — voice unavailable');
      return;
    }
    this.initClient(token);
  }

  private async initClient(token: string): Promise<void> {
    try {
      const { Client, GatewayIntentBits } = await import('discord.js');
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
        ],
      });
      this.client.on('clientReady', () => {
        this.logger.log(`Voice bot logged in as ${this.client.user?.tag}`);
      });
      await this.client.login(token);
    } catch (e) {
      this.logger.error('Failed to start voice bot:', e);
    }
  }

  get isReady(): boolean {
    return this.client !== null && this.client.isReady();
  }

  async joinChannel(guildId: string, channelId: string): Promise<void> {
    if (!guildId) {
      this.logger.log(`Joined voice channel ${channelId} (GG Chat — no Discord guild)`);
      return;
    }

    if (this.connections.has(guildId)) {
      const existing = this.connections.get(guildId);
      if (existing.joinConfig.channelId === channelId) return;
      existing.destroy();
      this.connections.delete(guildId);
      this.audioPlayers.delete(guildId);
    }

    try {
      const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior } = await import('@discordjs/voice');
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
      const { createAudioResource, StreamType } = await import('@discordjs/voice');
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
}
