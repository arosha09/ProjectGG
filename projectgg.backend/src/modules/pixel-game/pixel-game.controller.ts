import { Controller, Post, Get, Req, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { PixelGameService } from './pixel-game.service';

@ApiTags('Pixel Game')
@Controller('pixel-game')
export class PixelGameController {
  constructor(private readonly game: PixelGameService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('end-run')
  async endRun(
    @Req() req: any,
    @Body() body: { score: number; enemiesKilled: number; gemsCollected: number; monstersCaught?: string[] },
  ) {
    return this.game.endRun(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('stats')
  async getStats(@Req() req: any) {
    return this.game.getStats(req.user.id);
  }
}
