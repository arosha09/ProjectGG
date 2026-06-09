import { Controller, Post, Get, Put, Body, Res, HttpCode, HttpStatus, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TtsService, TtsSettings, TtsVoicePreset } from './tts.service';
import { UsersRepository } from '../../repositories/users.repository';
import { JwtAuthGuard } from '../../auth/jwt.guard';

@Controller('tts')
export class TtsController {
  constructor(
    private readonly ttsService: TtsService,
    private readonly usersRepository: UsersRepository,
  ) {}

  @Get('settings')
  async getSettings(): Promise<TtsSettings & { voices: ReturnType<TtsService['getVoices']> }> {
    const settings = await this.ttsService.getSettings();
    const voices = this.ttsService.getVoices();
    return { ...settings, voices };
  }

  @Put('settings')
  async saveSettings(@Body() body: Partial<TtsSettings>): Promise<TtsSettings> {
    console.log(`[TTS] saveSettings called with enabled_voices: ${JSON.stringify(body.enabled_voices)}`);
    const result = await this.ttsService.saveSettings(body);
    console.log(`[TTS] saveSettings returning enabled_voices: ${JSON.stringify(result.enabled_voices)}`);
    return result;
  }

  @Get('voices')
  async getActiveVoices(): Promise<TtsVoicePreset[]> {
    return this.ttsService.getActiveVoices();
  }

  @Get('voices/user')
  @UseGuards(JwtAuthGuard)
  async getActiveVoicesForUser(
    @Req() req: Request,
  ): Promise<{ voices: TtsVoicePreset[]; defaultVoice: string }> {
    const settings = await this.ttsService.getSettings();
    const voices = await this.ttsService.getActiveVoicesForUser();

    const enabledSet = new Set(settings.enabled_voices || []);
    const adminDefaultVoice = settings.provider === 'google-tts' ? settings.google_voice : settings.edge_voice;

    let defaultVoice = adminDefaultVoice;
    if (!enabledSet.has(defaultVoice)) {
      defaultVoice = voices.length > 0 ? voices[0].id : adminDefaultVoice;
    }

    const userId = (req as any).user?.id;
    if (userId) {
      try {
        const userTtsVoice = await this.usersRepository.getUserTtsVoice(userId);
        if (userTtsVoice?.selected_voice) {
          const voiceExists = voices.some(v => v.id === userTtsVoice.selected_voice);
          defaultVoice = voiceExists ? userTtsVoice.selected_voice : defaultVoice;
        }
      } catch {
      }
    }

    return { voices, defaultVoice };
  }

  @Put('user-voice')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setUserVoice(
    @Req() req: Request,
    @Body() body: { voice_id: string },
  ): Promise<{ success: boolean; selected_voice: string }> {
    const userId = (req as any).user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const settings = await this.ttsService.getSettings();
    const enabledVoices = settings.enabled_voices || [];

    if (!enabledVoices.includes(body.voice_id)) {
      throw new UnauthorizedException('Voice not available');
    }

    await this.usersRepository.updateUserTtsVoice(userId, body.voice_id);

    return { success: true, selected_voice: body.voice_id };
  }

  @Get('user-voice')
  @UseGuards(JwtAuthGuard)
  async getUserVoice(@Req() req: Request): Promise<{ selected_voice: string; is_default: boolean }> {
    const settings = await this.ttsService.getSettings();
    const adminDefault = settings.provider === 'google-tts' ? settings.google_voice : settings.edge_voice;

    const userId = (req as any).user?.id;
    if (!userId) {
      return { selected_voice: adminDefault, is_default: true };
    }

    try {
      const userTtsVoice = await this.usersRepository.getUserTtsVoice(userId);
      if (userTtsVoice?.selected_voice) {
        const enabledVoices = settings.enabled_voices || [];
        const voiceExists = enabledVoices.includes(userTtsVoice.selected_voice);
        return {
          selected_voice: voiceExists ? userTtsVoice.selected_voice : adminDefault,
          is_default: !voiceExists,
        };
      }
    } catch {
    }

    return { selected_voice: adminDefault, is_default: true };
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  async speak(
    @Body() body: { text: string; voice?: string; overrides?: { pitch?: string; rate?: string } },
    @Res() res: any,
  ): Promise<void> {
    if (!body.text?.trim()) {
      res.status(400).json({ message: 'Text is required' });
      return;
    }

    try {
      const result = await this.ttsService.synthesize(body.text, body.voice, body.overrides);
      if (!result) {
        res.status(503).json({ message: 'TTS provider not available. Use Web Speech API fallback.' });
        return;
      }
      res.set({
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      res.send(result.audio);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'TTS synthesis failed' });
    }
  }
}
