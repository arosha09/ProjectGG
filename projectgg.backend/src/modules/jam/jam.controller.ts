import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { JamService } from './jam.service';
import { JamSettings } from './jam.types';

@Controller('jam')
export class JamController {
  constructor(private readonly jamService: JamService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: { persistent?: boolean; settings?: Partial<JamSettings> }) {
    const userId = req.user.id;
    const existing = this.jamService.get_user_session(userId);
    if (existing) {
      this.jamService.leave_session(userId);
    }

    const session = this.jamService.create_session(userId, req.user.email ?? userId, body.persistent);
    if (body.settings) {
      this.jamService.update_settings(userId, body.settings);
    }
    return { code: session.code, session: this.jamService.to_state(session) };
  }

  @Post('join/:code')
  @UseGuards(JwtAuthGuard)
  join(@Req() req: any, @Param('code') code: string) {
    const userId = req.user.id;
    const session = this.jamService.join_session(code.toUpperCase(), userId, req.user.email ?? userId);
    if (!session) {
      throw new HttpException('Session not found or full', HttpStatus.NOT_FOUND);
    }
    return { session: this.jamService.to_state(session) };
  }

  @Post('leave')
  @UseGuards(JwtAuthGuard)
  leave(@Req() req: any) {
    const result = this.jamService.leave_session(req.user.id);
    if (!result) {
      throw new HttpException('Not in a jam session', HttpStatus.NOT_FOUND);
    }
    return { left: true, wasHost: result.wasHost, newHostId: result.newHostId };
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  current(@Req() req: any) {
    const session = this.jamService.get_user_session(req.user.id);
    if (!session) {
      return { session: null };
    }
    return { session: this.jamService.to_state(session) };
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(@Req() req: any, @Body() body: Partial<JamSettings>) {
    const settings = this.jamService.update_settings(req.user.id, body);
    if (!settings) {
      throw new HttpException('Not host or not in session', HttpStatus.FORBIDDEN);
    }
    return { settings };
  }
}
