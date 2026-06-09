import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AiService, AiPersonality } from './ai.service';
import { VoiceTrainingService } from './voice-training.service';
import { PERSONALITIES, PersonalityPreset } from './ai-prompts';
import { VoiceFingerprint } from './ai.types';
import type { Request } from 'express';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly voiceTrainingService: VoiceTrainingService,
  ) {}

  @Post('ask')
  @UseGuards(JwtAuthGuard)
  async askAi(
    @Req() req: Request,
    @Body()
    body: {
      message: string;
      conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
      pageContext?: { url: string; title: string; description: string };
      screenshot?: string;
    },
  ) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    if (!body.message || typeof body.message !== 'string') {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }
    const result = await this.aiService.handleVoiceQuery(
      userId,
      body.message,
      body.conversationHistory,
      body.pageContext,
      body.screenshot,
    );
    if (!result.success) {
      throw new HttpException(
        result.error || 'Failed to generate response',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { response: result.content };
  }

  @Get('joke')
  async getJoke(): Promise<{ joke: string }> {
    const joke = await this.aiService.getJoke();
    return { joke };
  }

  @Get('tip')
  async getTip(): Promise<{ tip: string }> {
    const tip = await this.aiService.getTip();
    return { tip };
  }

  @Get('personality')
  async getPersonality(): Promise<{
    personality: AiPersonality;
    presets: Array<{ id: PersonalityPreset; label: string; description: string; emoji: string }>;
  }> {
    const personality = await this.aiService.getPersonality();
    return {
      personality,
      presets: PERSONALITIES.map(p => ({
        id: p.id,
        label: p.label,
        description: p.description,
        emoji: p.emoji,
      })),
    };
  }

  @Put('personality')
  async savePersonality(
    @Body() body: { preset?: PersonalityPreset; custom_prompt?: string },
  ): Promise<AiPersonality> {
    return this.aiService.savePersonality({
      preset: body.preset,
      custom_prompt: body.custom_prompt,
    });
  }

  @Post('voice/upload')
  @UseGuards(JwtAuthGuard)
  async uploadVoiceRecording(
    @Req() req: Request,
    @Body()
    body: { audio: string; index: number; fingerprint?: VoiceFingerprint },
  ) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (body.index < 0 || body.index > 4) {
      throw new HttpException(
        'Invalid recording index (must be 0-4)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const audioBuffer = Buffer.from(body.audio, 'base64');

    if (audioBuffer.length > 5 * 1024 * 1024) {
      throw new HttpException(
        'Audio file too large (max 5MB)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.voiceTrainingService.uploadRecording(
      userId,
      audioBuffer,
      body.index,
      body.fingerprint,
    );

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      success: true,
      message: result.message,
      progress: result.progress,
      trainingComplete: result.progress === 5,
    };
  }

  @Post('voice/fingerprint')
  @UseGuards(JwtAuthGuard)
  async uploadFingerprint(
    @Req() req: Request,
    @Body() body: { fingerprint: VoiceFingerprint },
  ) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!body.fingerprint || typeof body.fingerprint !== 'object') {
      throw new HttpException(
        'Fingerprint data required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.voiceTrainingService.uploadFingerprint(
      userId,
      body.fingerprint,
    );

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return result;
  }

  @Get('voice/profile')
  @UseGuards(JwtAuthGuard)
  async getVoiceProfile(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const profile = await this.voiceTrainingService.getProfile(userId);
    const status = await this.voiceTrainingService.getTrainingStatus(userId);

    return {
      profile: profile
        ? {
            trainingCompleted: profile.training_completed,
            trainingCount: profile.training_count,
            customWakePhrase: profile.custom_wake_phrase,
            customVocabulary: profile.custom_vocabulary,
            trainedAt: profile.trained_at,
          }
        : null,
      status,
    };
  }

  @Post('voice/vocabulary')
  @UseGuards(JwtAuthGuard)
  async addVocabulary(@Req() req: Request, @Body() body: { words: string[] }) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!Array.isArray(body.words) || body.words.length === 0) {
      throw new HttpException(
        'Words array is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const validWords = body.words
      .filter((w) => typeof w === 'string' && w.length > 0 && w.length < 50)
      .slice(0, 100);

    if (validWords.length === 0) {
      throw new HttpException(
        'No valid words provided',
        HttpStatus.BAD_REQUEST,
      );
    }

    const success = await this.voiceTrainingService.addCustomVocabulary(
      userId,
      validWords,
    );

    if (!success) {
      throw new HttpException(
        'Failed to save vocabulary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { success: true, words: validWords };
  }

  @Post('transcribe')
  @UseGuards(JwtAuthGuard)
  async transcribe(@Req() req: Request, @Body() body: { audio: string }) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    if (!body.audio) {
      throw new HttpException('Audio required', HttpStatus.BAD_REQUEST);
    }

    const result = await this.aiService.transcribeAudio(body.audio);
    if (!result.success) {
      throw new HttpException(
        result.error || 'Transcription failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { transcript: result.content };
  }

  @Delete('voice/profile')
  @UseGuards(JwtAuthGuard)
  async deleteVoiceProfile(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const success = await this.voiceTrainingService.deleteProfile(userId);

    if (!success) {
      throw new HttpException(
        'Failed to delete profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { success: true };
  }
}
