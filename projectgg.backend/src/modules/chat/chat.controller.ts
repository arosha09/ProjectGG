import {
  Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, Query, Inject,
  UseInterceptors, UploadedFile, BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { DiscordBotService } from './discord-bot.service';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { randomBytes } from 'crypto';
import { extname } from 'path';
import * as fs from 'fs';

@ApiTags('Chat')
@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly discordBot: DiscordBotService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    private readonly configService: ConfigService,
  ) {}

  // ================================================================
  // LEGACY DISCORD ENDPOINTS (keep for backward compat)
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/guild')
  async getGuild(@Req() req: any) {
    let allowedChannelIds: Set<string> | undefined;

    // Find the user's Discord connection to filter channels by permission
    const { data: conn } = await this.supabase
      .schema('projectgg')
      .from('user_platform_connections')
      .select('platform_user_id')
      .eq('user_id', req.user.id)
      .eq('platform', 'discord')
      .single();

    if (conn?.platform_user_id) {
      const perms = await this.discordBot.getUserPermissions(conn.platform_user_id);
      if (perms?.permissions) {
        allowedChannelIds = new Set(
          perms.permissions.filter(p => p.canView).map(p => p.channelId),
        );
      }
    }

    return {
      channels: this.discordBot.getGuildChannels(allowedChannelIds),
      voiceMembers: this.discordBot.voiceMembers,
      botReady: this.discordBot.isReady,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/check-discord')
  async checkDiscord(@Req() req: any) {
    const userId = req.user.id;
    const { data } = await this.supabase
      .schema('projectgg')
      .from('user_platform_connections')
      .select('platform_username, platform_user_id')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .single();
    return { linked: !!data, discordUsername: data?.platform_username ?? null };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/permissions')
  async getPermissions(@Req() req: any) {
    const userId = req.user.id;
    const { data } = await this.supabase
      .schema('projectgg')
      .from('user_platform_connections')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .single();
    if (!data?.platform_user_id) return { linked: false, permissions: null };
    const perms = await this.discordBot.getUserPermissions(data.platform_user_id);
    return { linked: true, permissions: perms };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('chat/members')
  async getMembers() {
    try {
      return await this.discordBot.getGuildMembers();
    } catch {
      return [];
    }
  }

  // DISCORD CHAT — MESSAGES (synced with Discord guild)

  @Get('chat/history')
  async getHistory(@Query('channel') channel?: string, @Query('limit') limit?: string) {
    // Backfill Discord history into DB if needed (idempotent — skips if already populated)
    if (channel) {
      await this.discordBot.backfillChannel(channel).catch(() => {});
    }
    return this.chatService.getHistory(
      channel || undefined,
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('chat/send')
  async sendMessage(
    @Req() req: any,
    @Body() body: { content: string; channel_id?: string; reply_to?: number; attachment_url?: string },
  ) {
    const userId = req.user.id;
    const user = await this.chatService.findUserById(userId);
    const username = user?.username ?? req.user.email ?? 'Unknown';
    const avatarUrl = user?.avatar ?? null;

    const msg = await this.chatService.saveMessage(
      userId, username, body.content, body.channel_id, avatarUrl, body.reply_to, body.attachment_url,
    );

    // Relay to Discord bot
    let discordContent = `**${username}**: ${body.content}`;
    if (body.attachment_url) discordContent += `\n${body.attachment_url}`;
    this.discordBot.sendToDiscord(discordContent, body.channel_id).catch(() => {});

    this.chatGateway.broadcastMessage(msg);
    return msg;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('chat/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: jpeg, png, gif, webp, mp4');
    }

    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File too large (max 25MB)');
    }

    const ext = extname(file.originalname);
    const filename = `chat_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;

    const fileBuffer = fs.readFileSync(file.path);

    const { error: uploadError } = await this.supabase.storage
      .from('chat_uploads')
      .upload(filename, fileBuffer, { contentType: file.mimetype });

    fs.unlinkSync(file.path);

    if (uploadError) {
      throw new HttpException(uploadError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Use signed URL
    const { data: signedData, error: signError } = await this.supabase.storage
      .from('chat_uploads')
      .createSignedUrl(filename, 315360000);

    if (signError || !signedData?.signedUrl) {
      throw new HttpException(signError?.message ?? 'Failed to sign URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { url: signedData.signedUrl };
  }

  private readonly fallbackGifs = [
    { id: 'wave', url: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy.gif', preview: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy-downsized-small.gif', title: 'Wave' },
    { id: 'hype', url: 'https://media0.giphy.com/media/l0HlNaQ6gW0X7l6qY/giphy.gif', preview: 'https://media0.giphy.com/media/l0HlNaQ6gW0X7l6qY/giphy-downsized-small.gif', title: 'Hype' },
    { id: 'laugh', url: 'https://media2.giphy.com/media/l0HlTy9QUVqYjgxHy/giphy.gif', preview: 'https://media2.giphy.com/media/l0HlTy9QUVqYjgxHy/giphy-downsized-small.gif', title: 'Laugh' },
    { id: 'shrug', url: 'https://media4.giphy.com/media/10zfF42YbPLnwI/giphy.gif', preview: 'https://media4.giphy.com/media/10zfF42YbPLnwI/giphy-downsized-small.gif', title: 'Shrug' },
    { id: 'wow', url: 'https://media2.giphy.com/media/3oriO0OEd9QIDdllqE/giphy.gif', preview: 'https://media2.giphy.com/media/3oriO0OEd9QIDdllqE/giphy-downsized-small.gif', title: 'Wow' },
    { id: 'party', url: 'https://media1.giphy.com/media/xT8qBf6V1MNs8oI3ni/giphy.gif', preview: 'https://media1.giphy.com/media/xT8qBf6V1MNs8oI3ni/giphy-downsized-small.gif', title: 'Party' },
    { id: 'think', url: 'https://media0.giphy.com/media/1BXa2alBjrCXC/giphy.gif', preview: 'https://media0.giphy.com/media/1BXa2alBjrCXC/giphy-downsized-small.gif', title: 'Think' },
    { id: 'fire', url: 'https://media3.giphy.com/media/3o7aD2sa1jK4F3f5Wc/giphy.gif', preview: 'https://media3.giphy.com/media/3o7aD2sa1jK4F3f5Wc/giphy-downsized-small.gif', title: 'Fire' },
    { id: 'cry', url: 'https://media1.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', preview: 'https://media1.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy-downsized-small.gif', title: 'Cry' },
    { id: 'yes', url: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy.gif', preview: 'https://media0.giphy.com/media/26ufdip6qU2Hm7CBu/giphy-downsized-small.gif', title: 'Yes' },
    { id: 'no', url: 'https://media2.giphy.com/media/3o7btT1TBYmX2mY3eE/giphy.gif', preview: 'https://media2.giphy.com/media/3o7btT1TBYmX2mY3eE/giphy-downsized-small.gif', title: 'No' },
    { id: 'eyes', url: 'https://media3.giphy.com/media/26ufdip6qU2Hm7CBu/giphy.gif', preview: 'https://media3.giphy.com/media/26ufdip6qU2Hm7CBu/giphy-downsized-small.gif', title: 'Eyes' },
  ];

  @Get('chat/gifs')
  async searchGifs(@Query('q') q?: string, @Query('limit') limit?: string) {
    const query = q || '';
    const limitNum = limit ? Math.min(Number(limit), 50) : 12;

    const key = this.configService.get<string>('GIPHY_API_KEY');
    if (key) {
      try {
        const endpoint = query
          ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=${limitNum}`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=${limitNum}`;
        const res = await fetch(endpoint);
        const data = await res.json();
        if (data?.data?.length) {
          return {
            results: data.data.map((r: any) => ({
              id: r.id,
              url: r.images?.original?.url,
              preview: r.images?.fixed_width_small?.url,
              title: r.title,
            })),
          };
        }
      } catch {}
    }

    const filtered = query
      ? this.fallbackGifs.filter(g => g.title.toLowerCase().includes(query.toLowerCase()))
      : this.fallbackGifs;
    return { results: filtered.slice(0, limitNum) };
  }

  @Get('chat/gifs/trending')
  async trendingGifs() {
    return this.searchGifs('', '12');
  }

  // ================================================================
  // GG CHAT — SERVERS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers')
  async getServers(@Req() req: any) {
    return this.chatService.getServers(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers')
  async createServer(@Req() req: any, @Body() body: { name: string }) {
    if (!body.name?.trim()) throw new BadRequestException('Server name required');
    const server = await this.chatService.createServer(body.name.trim(), req.user.id);
    return server;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('gg/servers/:id')
  async updateServer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; avatar_url?: string },
  ) {
    const server = await this.chatService.updateServer(Number(id), req.user.id, body);
    return server;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/upload-avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadServerAvatar(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { serverId: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const serverId = Number(body.serverId);
    const server = await this.chatService.getServer(serverId);
    if (!server) throw new BadRequestException('Server not found');
    if (server.owner_id !== req.user.id) throw new BadRequestException('Not authorized');

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: jpeg, png, gif, webp');
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File too large (max 5MB)');
    }

    const ext = extname(file.originalname);
    const filename = `server_avatar_${serverId}_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;
    const fileBuffer = fs.readFileSync(file.path);
    const { error: uploadError } = await this.supabase.storage
      .from('chat_uploads')
      .upload(filename, fileBuffer, { contentType: file.mimetype });
    fs.unlinkSync(file.path);
    if (uploadError) {
      throw new HttpException(uploadError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const { data: { publicUrl } } = this.supabase.storage
      .from('chat_uploads')
      .getPublicUrl(filename);
    return this.chatService.updateServer(serverId, req.user.id, { avatar_url: publicUrl });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/servers/:id')
  async deleteServer(@Req() req: any, @Param('id') id: string) {
    await this.chatService.deleteServer(Number(id), req.user.id);
    return { success: true };
  }

  // ================================================================
  // GG CHAT — CHANNELS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers/:serverId/channels')
  async getChannels(@Req() req: any, @Param('serverId') serverId: string) {
    return this.chatService.getChannels(Number(serverId), req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/channels')
  async createChannel(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Body() body: { name: string; type: 'text' | 'voice'; allowed_roles?: string[] },
  ) {
    return this.chatService.createChannel(
      Number(serverId), body.name, body.type ?? 'text', req.user.id, body.allowed_roles,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/channels/:id')
  async deleteChannel(@Req() req: any, @Param('id') id: string) {
    await this.chatService.deleteChannel(Number(id), req.user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/channels/:id/roles')
  async getChannelRoles(@Param('id') id: string) {
    return this.chatService.getChannelRoles(Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('gg/channels/:id/roles')
  async setChannelRoles(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { roles: string[] },
  ) {
    const channelId = Number(id);
    const { data: ch } = await this.supabase.schema('projectgg').from('gg_channels').select('server_id').eq('id', channelId).single();
    if (!ch) throw new BadRequestException('Channel not found');
    await this.chatService.requirePermission(ch.server_id, req.user.id, 'manage_channels');
    await this.chatService.setChannelRoles(channelId, body.roles);
    return { success: true };
  }

  // ================================================================
  // GG CHAT — MEMBERS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers/:serverId/members')
  async getServerMembers(@Param('serverId') serverId: string) {
    return this.chatService.getServerMembers(Number(serverId));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/join')
  async joinServer(@Req() req: any, @Param('serverId') serverId: string) {
    await this.chatService.joinServer(Number(serverId), req.user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/leave')
  async leaveServer(@Req() req: any, @Param('serverId') serverId: string) {
    await this.chatService.leaveServer(Number(serverId), req.user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('gg/servers/:serverId/members/:memberId/roles')
  async changeMemberRoles(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Body() body: { roles: string[] },
  ) {
    await this.chatService.changeMemberRoles(
      Number(serverId), memberId, body.roles, req.user.id,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/members/:memberId/kick')
  async kickMember(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.chatService.kickMember(
      Number(serverId), memberId, req.user.id,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/members/:memberId/ban')
  async banMember(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.chatService.banMember(
      Number(serverId), memberId, req.user.id,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/servers/:serverId/bans/:memberId')
  async unbanMember(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.chatService.unbanMember(
      Number(serverId), memberId, req.user.id,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers/:serverId/bans')
  async getBannedMembers(
    @Req() req: any,
    @Param('serverId') serverId: string,
  ) {
    return this.chatService.getBannedMembers(
      Number(serverId), req.user.id,
    );
  }

  // ================================================================
  // GG CHAT — INVITE LINKS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/invites')
  async generateInvite(@Req() req: any, @Param('serverId') serverId: string) {
    return this.chatService.generateInvite(Number(serverId), req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/servers/:serverId/invites')
  async getServerInvites(@Req() req: any, @Param('serverId') serverId: string) {
    return this.chatService.getServerInvites(Number(serverId));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/servers/:serverId/invites/:inviteId/revoke')
  async revokeInvite(
    @Req() req: any,
    @Param('serverId') serverId: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.chatService.revokeInvite(Number(inviteId), req.user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/invites/:code')
  async joinViaInvite(@Req() req: any, @Param('code') code: string) {
    const serverId = await this.chatService.joinViaInvite(code, req.user.id);
    return { serverId };
  }

  // ================================================================
  // GG CHAT — MESSAGES
  // ================================================================

  @Get('gg/history')
  async getGgHistory(@Query('channel') channel?: string, @Query('limit') limit?: string) {
    return this.chatService.getHistory(
      channel || undefined,
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/send')
  async sendGgMessage(
    @Req() req: any,
    @Body() body: { content: string; channel_id: string; reply_to?: number; attachment_url?: string },
  ) {
    const userIdStr = req.user.id;
    const user = await this.chatService.findUserById(userIdStr);
    const username = user?.username ?? req.user.email ?? 'Unknown';
    const avatarUrl = user?.avatar ?? null;

    const msg = await this.chatService.saveMessage(
      req.user.id, username, body.content, body.channel_id, avatarUrl, body.reply_to, body.attachment_url,
    );

    this.chatGateway.broadcastMessage(msg);
    return msg;
  }

  // ================================================================
  // GG CHAT — USER SEARCH
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/users/search')
  async searchUsers(@Req() req: any, @Query('q') q: string) {
    if (!q || q.length < 1) return [];
    return this.chatService.searchUsers(q, req.user.id);
  }

  // ================================================================
  // GG CHAT — FRIENDS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/friends')
  async getFriends(@Req() req: any) {
    const userId = req.user.id;
    const [accepted, pending, sent] = await Promise.all([
      this.chatService.getFriends(userId),
      this.chatService.getPendingRequests(userId),
      this.chatService.getPendingSentRequests(userId),
    ]);

    const enrich = async (list: any[], field: string) => {
      for (const item of list) {
        const otherId = item.user_id === userId ? item.friend_id : item.user_id;
        const other = await this.chatService.findUserById(otherId);
        item[field] = other?.username ?? 'Unknown';
        item.other_avatar = other?.avatar ?? null;
        item.other_id = otherId;
      }
    };

    await Promise.all([
      enrich(accepted, 'other_username'),
      enrich(pending, 'other_username'),
      enrich(sent, 'other_username'),
    ]);

    const applyPresence = async (list: any[]) => {
      for (const item of list) {
        const other = await this.chatService.findUserById(item.other_id);
        item.status = other?.status ?? other?.sys_status ?? 'invisible';
      }
    };

    await Promise.all([
      applyPresence(accepted),
      applyPresence(pending),
      applyPresence(sent),
    ]);

    return { accepted, pending, sent };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/friends/request')
  async sendFriendRequest(
    @Req() req: any,
    @Body() body: { username: string },
  ) {
    if (!body.username?.trim()) throw new BadRequestException('Username required');
    const result = await this.chatService.sendFriendRequest(req.user.id, body.username.trim());
    const targetUser = await this.chatService.findUserById(result.friend_id);
    const senderUser = await this.chatService.findUserById(req.user.id);
    if (targetUser) {
      this.chatGateway.sendToUser(targetUser.id, 'friend-request', {
        id: result.id,
        userId: req.user.id,
        username: senderUser?.username ?? 'Unknown',
      });
      await this.chatService.createNotification(
        targetUser.id, 'friend_request', 'New Friend Request',
        `${senderUser?.username ?? 'Someone'} sent you a friend request`,
        { requestId: result.id, fromUserId: req.user.id, fromUsername: senderUser?.username },
      );
      this.chatGateway.sendToUser(targetUser.id, 'notification', {});
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/friends/accept/:id')
  async acceptFriendRequest(@Req() req: any, @Param('id') id: string) {
    await this.chatService.acceptFriendRequest(req.user.id, Number(id));

    const { data: reqData } = await this.supabase
      .schema('projectgg')
      .from('friends')
      .select('*')
      .eq('id', Number(id))
      .single();

    if (reqData) {
      this.chatGateway.sendToUser(reqData.user_id, 'friend-accepted', {
        friendId: req.user.id,
      });
      const accepter = await this.chatService.findUserById(req.user.id);
      await this.chatService.createNotification(
        reqData.user_id, 'friend_accepted', 'Friend Request Accepted',
        `${accepter?.username ?? 'Someone'} accepted your friend request`,
        { friendId: req.user.id, friendUsername: accepter?.username },
      );
      this.chatGateway.sendToUser(reqData.user_id, 'notification', {});
    }

    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/friends/:id')
  async removeFriend(@Req() req: any, @Param('id') id: string) {
    await this.chatService.removeFriend(req.user.id, Number(id));
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/friends/reject/:id')
  async rejectFriendRequest(@Req() req: any, @Param('id') id: string) {
    await this.chatService.rejectFriendRequest(req.user.id, Number(id));
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/friends/cancel/:id')
  async cancelFriendRequest(@Req() req: any, @Param('id') id: string) {
    await this.chatService.cancelFriendRequest(req.user.id, Number(id));
    return { success: true };
  }

  // ================================================================
  // GG CHAT — DM CONVERSATIONS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/dm/conversations')
  async getDmConversations(@Req() req: any) {
    return this.chatService.getDmConversations(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/dm/conversations')
  async createDmConversation(
    @Req() req: any,
    @Body() body: { otherUserId: string },
  ) {
    return this.chatService.createDmConversation(req.user.id, body.otherUserId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/dm/history/:id')
  async getDmHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getDmHistory(
      Number(id),
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/dm/send')
  async sendDmMessage(
    @Req() req: any,
    @Body() body: { content: string; conversation_id: number; reply_to?: number; attachment_url?: string },
  ) {
    const msg = await this.chatService.sendDmMessage(
      req.user.id, body.content, body.conversation_id, body.reply_to, body.attachment_url,
    );

    const { data: members } = await this.supabase
      .schema('projectgg')
      .from('dm_conversation_members')
      .select('user_id')
      .eq('conversation_id', body.conversation_id)
      .neq('user_id', req.user.id);

    for (const m of members ?? []) {
      this.chatGateway.sendToUser(m.user_id, 'dm-message', msg);
    }

    return msg;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/dm/conversations/:id')
  async deleteDmConversation(@Req() req: any, @Param('id') id: string) {
    await this.chatService.deleteDmConversation(req.user.id, Number(id));
    return { success: true };
  }

  // ================================================================
  // BLOCKING
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/users/block/:userId')
  async blockUser(@Req() req: any, @Param('userId') userId: string) {
    await this.chatService.blockUser(req.user.id, userId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gg/users/unblock/:userId')
  async unblockUser(@Req() req: any, @Param('userId') userId: string) {
    await this.chatService.unblockUser(req.user.id, userId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/users/blocked')
  async getBlockedUsers(@Req() req: any) {
    return this.chatService.getBlockedUsers(req.user.id);
  }

  // ================================================================
  // NOTIFICATIONS
  // ================================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('gg/notifications')
  async getNotifications(@Req() req: any) {
    return this.chatService.getNotifications(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('gg/notifications/:id/read')
  async markNotificationRead(@Param('id') id: string) {
    await this.chatService.markNotificationRead(Number(id));
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('gg/notifications/read-all')
  async markAllNotificationsRead(@Req() req: any) {
    await this.chatService.markAllNotificationsRead(req.user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('gg/notifications')
  async clearAllNotifications(@Req() req: any) {
    await this.chatService.clearAllNotifications(req.user.id);
    return { success: true };
  }
}
