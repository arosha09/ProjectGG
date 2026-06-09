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

export interface ChannelPermission {
  channelId: string;
  channelName: string;
  canView: boolean;
  canSend: boolean;
  canConnect: boolean;
  canSpeak: boolean;
}

export interface UserPermissions {
  roles: {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    position: number;
  }[];
  permissions: ChannelPermission[];
  joinedAt: string | null;
  nickname: string | null;
  avatar: string | null;
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

  getGuildChannels(allowedChannelIds?: Set<string>): GuildChannel[] {
    if (!this.client) return [];
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return [];

    const categoryNames = new Map<string, string>();
    for (const [, ch] of guild.channels.cache) {
      if (ch.type === 4) categoryNames.set(ch.id, ch.name);
    }

    return guild.channels.cache
      .filter(
        (ch: any) =>
          ch.type !== 4 && (!allowedChannelIds || allowedChannelIds.has(ch.id)),
      )
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

  async getUserPermissions(
    discordUserId: string,
  ): Promise<UserPermissions | null> {
    if (!this.client) return null;
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return null;

    try {
      const member = await guild.members.fetch(discordUserId);
      if (!member) return null;

      const roles = member.roles.cache
        .filter((r: any) => r.id !== guild.id)
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          position: r.rawPosition ?? r.position ?? 0,
        }));

      const permissions: ChannelPermission[] = [];
      for (const [, ch] of guild.channels.cache) {
        if (ch.type === 4) continue;
        const perms = ch.permissionsFor?.(member);
        permissions.push({
          channelId: ch.id,
          channelName: ch.name,
          canView: perms?.has('ViewChannel') ?? false,
          canSend: perms?.has('SendMessages') ?? false,
          canConnect: perms?.has('Connect') ?? false,
          canSpeak: perms?.has('Speak') ?? false,
        });
      }

      return {
        roles,
        permissions,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        nickname: member.nickname,
        avatar: member.user?.displayAvatarURL?.() ?? null,
      };
    } catch (e) {
      this.logger.warn(`Failed to fetch user ${discordUserId} permissions:`, e);
      return null;
    }
  }

  private membersCache: { timestamp: number; data: any[] } | null = null;
  private readonly MEMBERS_CACHE_TTL = 300_000; // 5 min

  async getGuildMembers(): Promise<
    {
      id: string;
      username: string;
      globalName: string | null;
      avatar: string | null;
      roles: { id: string; name: string; color: number }[];
      status: string;
      isBot: boolean;
    }[]
  > {
    if (
      this.membersCache &&
      Date.now() - this.membersCache.timestamp < this.MEMBERS_CACHE_TTL
    ) {
      return this.membersCache.data;
    }

    if (!this.client) return [];
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return [];

    try {
      const members = await guild.members.fetch({ limit: 1000 });
      const presenceMap = new Map<string, string>();
      if (guild.presences?.cache) {
        for (const [, p] of guild.presences.cache) {
          presenceMap.set(p.userId, p.status ?? 'dnd');
        }
      }

      const result = members
        .filter((m: any) => !m.user?.bot)
        .map((m: any) => ({
          id: m.id,
          username: m.user?.globalName ?? m.user?.username ?? 'Unknown',
          globalName: m.nickname ?? null,
          avatar: m.user?.displayAvatarURL?.() ?? null,
          roles: m.roles.cache
            .filter((r: any) => r.id !== guild.id)
            .map((r: any) => ({ id: r.id, name: r.name, color: r.color })),
          status: presenceMap.get(m.id) ?? m.presence?.status ?? 'dnd',
          isBot: m.user?.bot ?? false,
        }));

      this.membersCache = { timestamp: Date.now(), data: result };
      return result;
    } catch (e) {
      this.logger.warn('Failed to fetch guild members:', e);
      if (this.membersCache) return this.membersCache.data;
      return [];
    }
  }

  onModuleInit(): void {
    if (!this.token) {
      this.logger.warn('DISCORD_BOT_TOKEN not set — bot not started');
      return;
    }
    void this.startBot().catch((e) =>
      this.logger.error('Discord bot start failed:', e),
    );
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

      // Wait for the client to be fully ready before returning
      const ready = new Promise<void>((resolve) => {
        this.client.once('ready', () => {
          this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);
          const guilds = this.client.guilds.cache.map(
            (g: any) => `${g.name} (${g.id})`,
          );
          this.logger.log(`Watching guilds: ${guilds.join(', ')}`);
          this.syncVoiceStates();
          resolve();
        });
      });

      await this.client.login(this.token);
      await ready;

      // --- Text messages from ALL channels ---
      this.client.on('messageCreate', async (message: any) => {
        if (message.author.bot) return;
        if (this.guildId && message.guild?.id !== this.guildId) return;

        const channelName = message.channel.name ?? 'unknown';
        const guildName = message.guild?.name ?? 'DM';

        const firstAttachment = message.attachments?.first();
        const attachmentUrl = firstAttachment?.url ?? null;

        const firstSticker = message.stickers?.first();
        const stickerUrl =
          firstSticker?.imageURL?.() ?? firstSticker?.url ?? null;

        await this.storeMessage({
          username: message.author.globalName ?? message.author.username,
          content: message.content,
          source: 'discord',
          discord_message_id: message.id,
          channel_id: message.channel.id,
          channel_name: channelName,
          guild_name: guildName,
          channel_type: this.channelTypeLabel(message.channel.type),
          avatar_url: message.author.displayAvatarURL?.() ?? null,
          attachment_url: attachmentUrl,
          sticker_url: stickerUrl,
        });
      });

      // --- Voice state changes ---
      this.client.on(
        'voiceStateUpdate',
        async (oldState: any, newState: any) => {
          this.syncVoiceStates();

          const user = newState.member?.user ?? oldState.member?.user;
          if (!user || user.bot) return;
          if (
            this.guildId &&
            newState.guild?.id !== this.guildId &&
            oldState.guild?.id !== this.guildId
          )
            return;

          const guildName =
            newState.guild?.name ?? oldState.guild?.name ?? 'Unknown';

          if (!oldState.channelId && newState.channelId) {
            await this.storeSystemMessage(
              `**${user.globalName ?? user.username}** joined **${newState.channel.name}**`,
              newState.channel.name,
              guildName,
            );
          } else if (oldState.channelId && !newState.channelId) {
            await this.storeSystemMessage(
              `**${user.globalName ?? user.username}** left **${oldState.channel.name}**`,
              oldState.channel.name,
              guildName,
            );
          } else if (
            oldState.channelId &&
            newState.channelId &&
            oldState.channelId !== newState.channelId
          ) {
            await this.storeSystemMessage(
              `**${user.globalName ?? user.username}** moved **${oldState.channel.name}** → **${newState.channel.name}**`,
              newState.channel.name,
              guildName,
            );
          }
        },
      );
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
          username:
            state.member?.user?.globalName ??
            state.member?.user?.username ??
            'Unknown',
          channelId: state.channelId,
          channelName: channel.name,
        });
      }
    }
    this._voiceMembers = members;
  }

  private async storeInDb(data: {
    username: string;
    content: string;
    source: string;
    discord_message_id?: string;
    channel_id?: string;
    channel_name?: string;
    guild_name?: string;
    channel_type?: string;
    avatar_url?: string;
    attachment_url?: string;
    sticker_url?: string;
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
          avatar_url: data.avatar_url ?? null,
          attachment_url: data.attachment_url ?? null,
          sticker_url: data.sticker_url ?? null,
        });
      if (error) this.logger.error('DB insert error:', error);
    } catch (e) {
      this.logger.error('Failed to store message:', e);
    }
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
    avatar_url?: string;
    attachment_url?: string;
    sticker_url?: string;
  }): Promise<void> {
    await this.storeInDb(data);

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
        avatar_url: data.avatar_url ?? null,
        attachment_url: data.attachment_url ?? null,
        sticker_url: data.sticker_url ?? null,
        created_at: new Date().toISOString(),
      });
    }
  }

  private async storeSystemMessage(
    content: string,
    channelName: string,
    guildName: string,
  ): Promise<void> {
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
      0: 'text',
      2: 'voice',
      4: 'category',
      5: 'announcement',
      13: 'stage',
      15: 'forum',
      16: 'media',
    };
    return labels[type] ?? 'text';
  }

  async backfillChannel(channelId: string, limit = 50): Promise<void> {
    if (!this.client) return;
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || (channel.type !== 0 && channel.type !== 5)) return;

    const botMember =
      guild.members.me ?? (await guild.members.fetch(this.client.user.id));
    if (!botMember?.permissionsIn(channel.id).has('ViewChannel')) {
      this.logger.warn(
        `Skipping backfill — no ViewChannel permission for ${channel.name} (${channelId})`,
      );
      return;
    }

    const MAX_TOTAL = 1000;
    let fetched = 0;

    try {
      // Fetch in pages of 100, stop when we hit messages we already have
      let lastId: string | undefined;
      let hitExisting = false;

      while (fetched < MAX_TOTAL && !hitExisting) {
        const options: any = { limit: Math.min(100, limit) };
        if (lastId) options.before = lastId;
        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;

        // Check which of these already exist in DB
        const msgIds = messages.map((m: any) => m.id);
        const { data: existing } = await this.supabase
          .schema('projectgg')
          .from('chat_messages')
          .select('discord_message_id')
          .in('discord_message_id', msgIds);

        const existingIds = new Set(
          (existing ?? []).map((r: any) => r.discord_message_id),
        );

        // Store in chronological order (messages.fetch returns newest first)
        const reversed = Array.from(messages.values()).reverse();
        for (const msg of reversed) {
          const m: any = msg;
          if (m.author.bot) continue;
          if (existingIds.has(m.id)) {
            hitExisting = true;
            continue;
          }
          await this.storeInDb({
            username: m.author.globalName ?? m.author.username,
            content: m.content,
            source: 'discord',
            discord_message_id: m.id,
            channel_id: channelId,
            channel_name: channel.name,
            guild_name: guild.name,
            channel_type: this.channelTypeLabel(channel.type),
            avatar_url: m.author.displayAvatarURL?.() ?? null,
          });
          fetched++;
        }

        // Get the oldest message id for next page
        const oldest = messages.last();
        lastId = oldest?.id;
      }

      if (fetched > 0) {
        this.logger.log(
          `Backfilled ${fetched} messages for channel ${channel.name} (${channelId})`,
        );
      }
    } catch (e) {
      this.logger.warn(`Failed to backfill channel ${channelId}:`, e);
    }
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
          (c: any) =>
            (c.type === 0 || c.type === 5) &&
            c.permissionsFor?.(this.client.user)?.has?.('SendMessages'),
        );
        if (channel) await channel.send(content);
      }
    } catch (e) {
      this.logger.error('Failed to send to Discord:', e);
    }
  }
}
