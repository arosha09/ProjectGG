import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatMessage, AiResponse } from './ai.types';
import { getSystemPrompt } from './ai-prompts';
import { findTriviaAnswer, getRandomJoke, getRandomTip } from './game-knowledge';
import { VoiceTrainingService } from './voice-training.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  private readonly botUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  private readonly groqModel = 'llama-3.3-70b-versatile';
  private readonly userRateLimit = 10;
  private readonly userWindowMs = 5 * 60 * 1000;
  private readonly channelRateLimit = 50;
  private readonly channelWindowMs = 60 * 1000;

  private userRequests: Map<string, number[]> = new Map();
  private channelRequests: Map<string, number[]> = new Map();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    @Inject(forwardRef(() => ChatService)) private readonly chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway)) private readonly chatGateway: ChatGateway,
    private readonly voiceTrainingService: VoiceTrainingService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.cleanupRateLimitMaps();
    setInterval(() => this.cleanupRateLimitMaps(), 60000);
  }

  async handleMessage(message: ChatMessage): Promise<void> {
    const content = message.content || '';

    if (!this.isApexMentioned(content)) {
      return;
    }

    if (await this.isRateLimited(message.user_id?.toString(), message.channel_id)) {
      this.logger.debug(`Message from user ${message.user_id} rate limited`);
      return;
    }

    const isVerified = await this.voiceTrainingService.isSpeakerVerified(message.user_id?.toString());
    const customVocabulary = await this.voiceTrainingService.getCustomVocabulary(message.user_id?.toString());

    const triviaAnswer = findTriviaAnswer(content);
    if (triviaAnswer) {
      await this.sendApexMessage(triviaAnswer, message.channel_id, false);
      return;
    }

    const response = await this.generateResponse(content, message, isVerified, customVocabulary);

    if (response.success && response.content) {
      await this.sendApexMessage(response.content, message.channel_id, true);
    }
  }

  private isApexMentioned(content: string): boolean {
    const patterns = [
      /@A\.P\.E\.X\./i,
      /@APEX\b/i,
      /\bhey\s+APEX\b/i,
      /\bhi\s+APEX\b/i,
      /\bhello\s+APEX\b/i,
      /\b yo\s+APEX/i,
      /\bAPEX\s+help/i,
      /\bAPEX\?/i,
    ];
    return patterns.some(p => p.test(content));
  }

  private async generateResponse(
    prompt: string,
    message: ChatMessage,
    isVerified: boolean,
    customVocabulary: string[],
  ): Promise<AiResponse> {
    try {
      const context = await this.buildContext(message.channel_id);

      try {
        return await this.callGroq(prompt, context, isVerified, customVocabulary);
      } catch (error) {
        if (error.status === 429 || error.message?.includes('rate limit')) {
          this.logger.warn('Groq rate limited, falling back to Gemini');
          return await this.callGemini(prompt, context, isVerified, customVocabulary);
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`AI response generation failed: ${error.message}`);
      return { success: false, error: 'Failed to generate response' };
    }
  }

  private async callGroq(
    prompt: string,
    context: ChatMessage[],
    isVerified: boolean,
    customVocabulary: string[],
  ): Promise<AiResponse> {
    const apiKey = this.configService.get('AI_GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('AI_GROQ_API_KEY not configured');
    }

    const systemPrompt = getSystemPrompt(isVerified, customVocabulary);

    const conversationHistory = context.map(m => ({
      role: m.username === 'A.P.E.X.' ? 'assistant' : 'user',
      name: m.username,
      content: `${m.username}: ${m.content}`,
    }));

    const response = await fetch(this.groqApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.8,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('Empty response from Groq');
    }

    return { success: true, content };
  }

  private async callGemini(
    prompt: string,
    context: ChatMessage[],
    isVerified: boolean,
    customVocabulary: string[],
  ): Promise<AiResponse> {
    const apiKey = this.configService.get('AI_GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('AI_GOOGLE_API_KEY not configured');
    }

    const systemPrompt = getSystemPrompt(isVerified, customVocabulary);

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...context.map(m => ({
        role: m.username === 'A.P.E.X.' ? 'model' : 'user',
        parts: [{ text: `${m.username}: ${m.content}` }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ];

    const response = await fetch(`${this.geminiApiUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    return { success: true, content };
  }

  private async buildContext(channelId: string | undefined, limit = 15): Promise<ChatMessage[]> {
    if (!channelId) return [];
    try {
      const history = await this.chatService.getHistory(channelId, limit);
      return history.filter(m =>
        !m.content.startsWith('@A.P.E.X.') &&
        !m.content.startsWith('@APEX') &&
        !m.attachment_url
      );
    } catch (error) {
      this.logger.error(`Failed to build context: ${error.message}`);
      return [];
    }
  }

  private async sendApexMessage(content: string, channelId: string | undefined, useAi: boolean): Promise<void> {
    if (!channelId) return;

    try {
      const bot = await this.chatService.findBotById(this.botUserId);
      if (!bot) {
        this.logger.error(`Bot ${this.botUserId} not found in ai_bots table`);
        return;
      }

      const msg = await this.chatService.saveMessage(
        bot.id,
        bot.username,
        content,
        channelId,
        undefined,
        undefined,
        undefined,
        'ai',
      );

      (msg as any).isBotMessage = true;

      this.chatGateway.broadcastMessage(msg);
    } catch (error) {
      this.logger.error(`Failed to send A.P.E.X. message: ${error.message}`);
    }
  }

  private async isRateLimited(userId: string | undefined, channelId: string | undefined): Promise<boolean> {
    if (!userId || !channelId) return false;

    const now = Date.now();

    const userTimes = this.userRequests.get(userId) || [];
    const recentUserTimes = userTimes.filter(t => now - t < this.userWindowMs);
    if (recentUserTimes.length >= this.userRateLimit) {
      return true;
    }
    recentUserTimes.push(now);
    this.userRequests.set(userId, recentUserTimes);

    const channelTimes = this.channelRequests.get(channelId) || [];
    const recentChannelTimes = channelTimes.filter(t => now - t < this.channelWindowMs);
    if (recentChannelTimes.length >= this.channelRateLimit) {
      return true;
    }
    recentChannelTimes.push(now);
    this.channelRequests.set(channelId, recentChannelTimes);

    return false;
  }

  private cleanupRateLimitMaps(): void {
    const now = Date.now();
    for (const [userId, times] of this.userRequests.entries()) {
      const filtered = times.filter(t => now - t < this.userWindowMs);
      if (filtered.length === 0) {
        this.userRequests.delete(userId);
      } else {
        this.userRequests.set(userId, filtered);
      }
    }
    for (const [channelId, times] of this.channelRequests.entries()) {
      const filtered = times.filter(t => now - t < this.channelWindowMs);
      if (filtered.length === 0) {
        this.channelRequests.delete(channelId);
      } else {
        this.channelRequests.set(channelId, filtered);
      }
    }
  }

  async handleVoiceQuery(userId: string, content: string): Promise<AiResponse> {
    const isVerified = await this.voiceTrainingService.isSpeakerVerified(userId);
    const customVocabulary = await this.voiceTrainingService.getCustomVocabulary(userId);

    const message: ChatMessage = {
      id: 0,
      user_id: userId,
      username: 'User',
      content,
      source: 'voice',
      channel_id: undefined,
      created_at: new Date().toISOString(),
    };

    const triviaAnswer = findTriviaAnswer(content);
    if (triviaAnswer) {
      return { success: true, content: triviaAnswer };
    }

    return this.generateResponse(content, message, isVerified, customVocabulary);
  }

  async getJoke(): Promise<string> {
    return getRandomJoke();
  }

  async getTip(): Promise<string> {
    return getRandomTip();
  }
}