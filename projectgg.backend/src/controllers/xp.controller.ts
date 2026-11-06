import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { XpService } from '../services/xp.service';
import {
  UserRankDto,
  XpResultDto,
  DailyClaimDto,
  DailyClaimRequestDto,
  CanClaimDailyDto,
  AwardCustomXpDto,
  LeaderboardEntryDto,
} from 'src/dto/xp/xp.dto';
import { ChatGateway } from 'src/modules/chat/chat.gateway';

@ApiTags('XP')
@Controller('xp')
export class XpController {
  constructor(
    private readonly xpService: XpService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('rank')
  @ApiQuery({ name: 'user_id', type: String, required: false, example: 'uuid' })
  async getUserRank(
    @Req() req: any,
    @Query('user_id', new ParseUUIDPipe({ optional: true })) userId?: string,
  ): Promise<UserRankDto> {
    const uid = userId || req.user?.id;
    if (!uid)
      throw new BadRequestException(
        'Provide user_id query param or authenticate',
      );
    return this.xpService.getUserRank(uid);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('daily-claim')
  @ApiBody({ type: DailyClaimRequestDto })
  async claimDailyLogin(
    @Req() req: any,
    @Body() body: DailyClaimRequestDto,
  ): Promise<DailyClaimDto> {
    const userId = body.user_id || req.user.id;
    const result = await this.xpService.awardDailyLogin(userId);
    this.chatGateway.sendToUser(userId, 'xp-update', { userId });
    this.chatGateway.broadcastServerEvent('xp-update', { userId });
    return result;
  }

  @Get('can-claim-daily')
  @ApiQuery({ name: 'user_id', type: String, required: false, example: 'uuid' })
  async canClaimDaily(
    @Req() req: any,
    @Query('user_id', new ParseUUIDPipe({ optional: true })) userId?: string,
  ): Promise<CanClaimDailyDto> {
    const uid = userId || req.user?.id;
    if (!uid)
      throw new BadRequestException(
        'Provide user_id query param or authenticate',
      );
    return this.xpService.canClaimDaily(uid);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('custom')
  @ApiBody({ type: AwardCustomXpDto })
  async awardCustomXp(
    @Req() req: any,
    @Body() body: AwardCustomXpDto,
  ): Promise<XpResultDto> {
    const userId = body.user_id || req.user.id;
    const result = await this.xpService.awardCustomXp(
      userId,
      body.xp,
      body.source,
      body.source_id,
      body.character_id,
    );
    this.chatGateway.sendToUser(userId, 'xp-update', { userId });
    this.chatGateway.broadcastServerEvent('xp-update', { userId });
    return result;
  }

  @Get('leaderboard')
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 50 })
  async getLeaderboard(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<LeaderboardEntryDto[]> {
    return this.xpService.getLeaderboard(limit);
  }
}
