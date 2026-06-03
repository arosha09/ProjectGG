import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { CardCollectionService } from './card-collection.service';

@ApiTags('Card Collection')
@Controller('cards')
export class CardCollectionController {
  constructor(private readonly cardService: CardCollectionService) {}

  // ── Daily Draw ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('draw/daily')
  async getDailyDrawCards(@Req() req: any) {
    return this.cardService.getDailyDrawCards(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('draw/daily/claim')
  async claimDailyDraw(@Req() req: any) {
    return this.cardService.claimDailyDraw(req.user.id);
  }

  // ── Ticket Draw ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('draw/ticket/:ticketId')
  async drawWithTicket(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.cardService.drawWithTicket(req.user.id, Number(ticketId));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('tickets')
  async getTickets(@Req() req: any) {
    return this.cardService.getTickets(req.user.id);
  }

  // ── Collection ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('collection')
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'page_size', type: Number, required: false })
  @ApiQuery({ name: 'tier', type: String, required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'sort_by', type: String, required: false })
  async getCollection(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(24), ParseIntPipe) pageSize: number,
    @Query('tier') tier?: string,
    @Query('search') search?: string,
    @Query('sort_by') sortBy?: string,
  ) {
    return this.cardService.getCollection(req.user.id, page, pageSize, tier, search, sortBy);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('collection/stats')
  async getCollectionStats(@Req() req: any) {
    return this.cardService.getStats(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('collection/:gameCode/favorite')
  async toggleFavorite(@Req() req: any, @Param('gameCode') gameCode: string) {
    return this.cardService.toggleFavorite(req.user.id, gameCode);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('showcase/:userId')
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'page_size', type: Number, required: false })
  @ApiQuery({ name: 'sort_by', type: String, required: false })
  async getShowcase(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
    @Query('sort_by') sortBy?: string,
  ) {
    return this.cardService.getShowcase(userId, page, pageSize, sortBy);
  }

  // ── Trading ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('trade')
  async createTrade(
    @Req() req: any,
    @Body() body: {
      proposerCardIds: number[];
      receiverId: string;
      receiverCardIds: number[];
      allowUnfair?: boolean;
      message?: string;
      parentTradeId?: number;
      // Backwards-compat: single-card fields (used by older clients)
      proposerCardId?: number;
      receiverCardId?: number;
    },
  ) {
    const proposerCardIds = body.proposerCardIds?.length
      ? body.proposerCardIds
      : (body.proposerCardId ? [body.proposerCardId] : []);
    const receiverCardIds = body.receiverCardIds?.length
      ? body.receiverCardIds
      : (body.receiverCardId ? [body.receiverCardId] : []);

    return this.cardService.createTrade(
      req.user.id,
      proposerCardIds,
      body.receiverId,
      receiverCardIds,
      !!body.allowUnfair,
      body.message ?? null,
      body.parentTradeId ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('trade/:tradeId/counter')
  async counterTrade(
    @Req() req: any,
    @Param('tradeId') tradeId: string,
    @Body() body: { counterProposerCardIds: number[]; counterReceiverCardIds: number[]; message?: string },
  ) {
    return this.cardService.counterTrade(
      Number(tradeId),
      req.user.id,
      body.counterProposerCardIds || [],
      body.counterReceiverCardIds || [],
      body.message ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('trade/fairness')
  async checkTradeFairness(
    @Req() req: any,
    @Query('proposerCardIds') proposerCardIds?: string,
    @Query('receiverCardIds') receiverCardIds?: string,
    @Query('proposerCardId') proposerCardId?: string,
    @Query('receiverCardId') receiverCardId?: string,
  ) {
    const pIds = proposerCardIds
      ? proposerCardIds.split(',').map(Number).filter(Boolean)
      : (proposerCardId ? [Number(proposerCardId)] : []);
    const rIds = receiverCardIds
      ? receiverCardIds.split(',').map(Number).filter(Boolean)
      : (receiverCardId ? [Number(receiverCardId)] : []);
    return this.cardService.checkTradeFairness(pIds, rIds);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('gift')
  async giftCard(
    @Req() req: any,
    @Body() body: { gifterCardId: number; receiverId: string },
  ) {
    return this.cardService.giftCard(req.user.id, body.gifterCardId, body.receiverId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('trades')
  async getTrades(@Req() req: any, @Query('otherUserId') otherUserId?: string) {
    return this.cardService.getTrades(req.user.id, otherUserId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('trade/:tradeId/accept')
  async acceptTrade(@Req() req: any, @Param('tradeId') tradeId: string) {
    return this.cardService.acceptTrade(Number(tradeId), req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('trade/:tradeId/reject')
  async rejectTrade(@Req() req: any, @Param('tradeId') tradeId: string) {
    return this.cardService.rejectTrade(Number(tradeId), req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('trade/:tradeId')
  async cancelTrade(@Req() req: any, @Param('tradeId') tradeId: string) {
    return this.cardService.cancelTrade(Number(tradeId), req.user.id);
  }

  // ── Tasks ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('tasks/progress')
  async getTaskProgress(@Req() req: any) {
    return this.cardService.getTaskProgress(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('tasks/track/:taskType')
  async trackTask(@Req() req: any, @Param('taskType') taskType: string) {
    return this.cardService.trackTask(req.user.id, taskType);
  }

  // ── Reactions ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('reactions')
  async addReaction(
    @Req() req: any,
    @Body() body: { messageId: number; messageSource: string; emoji: string },
  ) {
    return this.cardService.addReaction(body.messageId, body.messageSource, req.user.id, body.emoji);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('reactions')
  async removeReaction(
    @Req() req: any,
    @Body() body: { messageId: number; messageSource: string; emoji: string },
  ) {
    return this.cardService.removeReaction(body.messageId, body.messageSource, req.user.id, body.emoji);
  }

  @Get('reactions/:messageSource')
  async getMessageReactions(
    @Param('messageSource') messageSource: string,
    @Query('ids') ids: string,
  ) {
    const messageIds = ids.split(',').map(Number).filter(n => !isNaN(n));
    return this.cardService.getMessageReactions(messageIds, messageSource);
  }

  // ── Leaderboard ──

  @Get('leaderboard')
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getLeaderboard(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.cardService.getLeaderboard(limit);
  }
}
