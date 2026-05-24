import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { Inject } from '@nestjs/common';

export interface GuildChannel {
  id: string;
  name: string;
  type: number;
  typeLabel: string;
  position: number;
  categoryId: string | null;
  categoryName: string | null;
}

export interface VoiceMember {
  userId: string;
  username: string;
  channelId: string;
  channelName: string;
}

@Injectable()
export class DiscordBotService implements OnModuleInit {
  private readonly logger = new Logger(DiscordBotService.name);
  private client: any = null;
  private token: string;
  private guildId: string;
  private onMessageCallback: ((msg: any) => void) | null = null;

  // Voice state cache for quick lookups
  private _voiceMembers: VoiceMember[] = [];

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    configService: ConfigService,
  ) {
    this.token = configService.get<string>('DISCORD_BOT_TOKEN') ?? '';
    this.guildId = configService.get<string>('DISCORD_GUILD_ID') ?? '';
  }

  setMessageCallback(cb: (msg: any) => void): void {
    this.onMessageCallback = cb;
  }

  get voiceMembers(): VoiceMember[] {
    return this._voiceMembers;
  }

  get isReady(): boolean {
    return this.client !== null && this.client.isReady();
  }

  getGuildChannels(): GuildChannel[] {
    if (!this.client) return [];
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return [];

    const categoryNames = new Map<string, string>();
    for (const [, ch] of guild.channels.cache) {
      if (ch.type === 4) categoryNames.set(ch.id, ch.name);
    }

    return guild.channels.cache
      .filter((ch: any) => ch.type !== 4) // exclude category channels themselves
      .map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        typeLabel: this.channelTypeLabel(ch.type),
        position: ch.position ?? 0,
        categoryId: ch.parentId ?? null,
        categoryName: categoryNames.get(ch.parentId) ?? null,
      }))
      .sort((a: GuildChannel, b: GuildChannel) => a.position - b.position);
  }

  async onModuleInit(): Promise<void> {
    if (!this.token) {
      this.logger.warn('DISCORD_BOT_TOKEN not set — bot not started');
      return;
    }
    await this.startBot();
  }

  private async startBot(): Promise<void> {
    try {
      const { Client, GatewayIntentBits } = await import('discord.js');
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildVoiceStates,
        ],
      });

      this.client.on('ready', () => {
        this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);
        const guilds = this.client.guilds.cache.map((g: any) => `${g.name} (${g.id})`);
        this.logger.log(`Watching guilds: ${guilds.join(', ')}`);

        // Initial sync of voice states
        this.syncVoiceStates();
      });

      // --- Text messages from ALL channels ---
      this.client.on('messageCreate', async (message: any) => {
        if (message.author.bot) return;
        if (this.guildId && message.guild?.id !== this.guildId) return;

        const channelName = message.channel.name ?? 'unknown';
        const guildName = message.guild?.name ?? 'DM';

        await this.storeMessage({
          username: message.author.globalName ?? message.author.username,
          content: message.content,
          source: 'discord',
          discord_message_id: message.id,
          channel_id: message.channel.id,
          channel_name: channelName,
          guild_name: guildName,
          channel_type: this.channelTypeLabel(message.channel.type),
        });
      });

      // --- Voice state changes ---
      this.client.on('voiceStateUpdate', async (oldState: any, newState: any) => {
        this.syncVoiceStates();

        const user = newState.member?.user ?? oldState.member?.user;
        if (!user || user.bot) return;
        if (this.guildId && newState.guild?.id !== this.guildId && oldState.guild?.id !== this.guildId) return;

        const guildName = newState.guild?.name ?? oldState.guild?.name ?? 'Unknown';

        if (!oldState.channelId && newState.channelId) {
          await this.storeSystemMessage(
            `**${user.globalName ?? user.username}** joined **${newState.channel.name}**`,
            newState.channel.name, guildName,
          );
        } else if (oldState.channelId && !newState.channelId) {
          await this.storeSystemMessage(
            `**${user.globalName ?? user.username}** left **${oldState.channel.name}**`,
            oldState.channel.name, guildName,
          );
        } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
          await this.storeSystemMessage(
            `**${user.globalName ?? user.username}** moved **${oldState.channel.name}** → **${newState.channel.name}**`,
            newState.channel.name, guildName,
          );
        }
      });

      await this.client.login(this.token);
    } catch (e) {
      this.logger.error('Failed to start Discord bot:', e);
    }
  }

  private syncVoiceStates(): void {
    if (!this.client) return;
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return;

    const members: VoiceMember[] = [];
    for (const [, state] of guild.voiceStates.cache) {
      const channel = guild.channels.cache.get(state.channelId);
      if (channel) {
        members.push({
          userId: state.id,
          username: state.member?.user?.globalName ?? state.member?.user?.username ?? 'Unknown',
          channelId: state.channelId,
          channelName: channel.name,
        });
      }
    }
    this._voiceMembers = members;
  }

  private async storeMessage(data: {
    username: string;
    content: string;
    source: string;
    discord_message_id?: string;
    channel_id?: string;
    channel_name?: string;
    guild_name?: string;
    channel_type?: string;
  }): Promise<void> {
    try {
      const { error } = await this.supabase
        .schema('projectgg')
        .from('chat_messages')
        .insert({
          username: data.username,
          content: data.content,
          source: data.source,
          discord_message_id: data.discord_message_id ?? null,
          channel_id: data.channel_id ?? null,
          channel_name: data.channel_name ?? null,
          guild_name: data.guild_name ?? null,
          channel_type: data.channel_type ?? null,
        });
      if (error) this.logger.error('DB insert error:', error);
    } catch (e) {
      this.logger.error('Failed to store message:', e);
    }

    if (this.onMessageCallback) {
      this.onMessageCallback({
        id: Date.now(),
        username: data.username,
        content: data.content,
        source: data.source,
        channel_id: data.channel_id,
        channel_name: data.channel_name,
        guild_name: data.guild_name,
        channel_type: data.channel_type,
        created_at: new Date().toISOString(),
      });
    }
  }

  private async storeSystemMessage(content: string, channelName: string, guildName: string): Promise<void> {
    await this.storeMessage({
      username: 'System',
      content,
      source: 'discord',
      channel_name: channelName,
      guild_name: guildName,
      channel_type: 'voice',
    });
  }

  private channelTypeLabel(type: number): string {
    const labels: Record<number, string> = {
      0: 'text', 2: 'voice', 4: 'category',
      5: 'announcement', 13: 'stage', 15: 'forum', 16: 'media',
    };
    return labels[type] ?? 'text';
  }

  async sendToDiscord(content: string, channelId?: string): Promise<void> {
    if (!this.client) return;
    try {
      if (channelId) {
        const channel = await this.client.channels.fetch(channelId);
        if (channel) await channel.send(content);
      } else {
        const guild = this.client.guilds.cache.get(this.guildId);
        if (!guild) return;
        const channel = guild.channels.cache.find(
          (c: any) => (c.type === 0 || c.type === 5) && c.permissionsFor?.(this.client.user)?.has?.('SendMessages'),
        );
        if (channel) await channel.send(content);
      }
    } catch (e) {
      this.logger.error('Failed to send to Discord:', e);
    }
  }
}
