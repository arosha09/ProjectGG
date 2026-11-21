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
  AddXpDto,
  AwardFirstGameBonusDto,
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('character-events')
  async awardCharacterEvents(@Req() req: any, @Body() body: any) {
    const result = await this.xpService.awardCharacterEvents(req.user.id, body);
    if (result.awarded_xp > 0) this.chatGateway.sendToUser(req.user.id, 'xp-update', { userId: req.user.id });
    return result;
  }

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
    const userId = req.user.id;
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
    const userId = req.user.id;
    if (!Number.isSafeInteger(body.xp) || body.xp <= 0 || body.xp > 100000 || typeof body.source !== 'string' || !body.source.trim()) {
      throw new BadRequestException('A positive XP amount up to 100000 and a source are required');
    }
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('add')
  @ApiBody({ type: AddXpDto })
  async addXp(
    @Req() req: any,
    @Body() body: AddXpDto,
  ): Promise<XpResultDto> {
    const userId = body.user_id || req.user?.id;
    if (!userId)
      throw new BadRequestException('Provide user_id or authenticate');
    return this.xpService.addXp(userId, body.xp, body.source, body.source_id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('first-game-bonus')
  @ApiBody({ type: AwardFirstGameBonusDto })
  async awardFirstGameBonus(
    @Req() req: any,
    @Body() body: AwardFirstGameBonusDto,
  ): Promise<any> {
    const userId = body.user_id || req.user?.id;
    if (!userId)
      throw new BadRequestException('Provide user_id or authenticate');
    return this.xpService.awardFirstGameBonus(userId);
  }
}
