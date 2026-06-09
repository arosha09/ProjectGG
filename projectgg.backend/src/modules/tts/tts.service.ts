import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';

export type TtsProvider = 'edge-tts' | 'google-tts' | 'webspeech';

export interface TtsVoicePreset {
  id: string;
  label: string;
  gender: string;
  pitch?: string;
  rate?: string;
}

export interface TtsSettings {
  provider: TtsProvider;
  edge_voice: string;
  google_voice: string;
  google_api_key: string;
  enabled_voices: string[];
  voice_overrides?: Record<string, { pitch?: string; rate?: string }>;
  voice_labels?: Record<string, string>;
}

export interface UserTtsPreferences {
  selected_voice: string;
}

export const DEFAULT_TTS_PREFERENCES: UserTtsPreferences = {
  selected_voice: '',
};

@Injectable()
export class TtsService implements OnModuleInit {
  private readonly logger = new Logger(TtsService.name);

  private static readonly DEFAULT_SETTINGS: TtsSettings = {
    provider: 'edge-tts',
    edge_voice: 'en-US-AndrewMultilingualNeural',
    google_voice: 'en-US-Neural2-H',
    google_api_key: '',
    enabled_voices: [
      'en-US-AndrewMultilingualNeural',
      'en-US-AvaMultilingualNeural',
      'en-US-SteffanNeural',
      'en-US-AriaNeural',
      'en-US-GuyNeural',
    ],
  };

  private static readonly EDGE_VOICES: TtsVoicePreset[] = [
    { id: 'en-US-AndrewMultilingualNeural', label: 'APEX Commander', gender: 'Male', pitch: '-2Hz', rate: '-5%' },
    { id: 'en-US-AvaMultilingualNeural', label: 'APEX Assistant', gender: 'Female', pitch: '+1Hz', rate: '-5%' },
    { id: 'en-US-SteffanNeural', label: 'APEX Analyst', gender: 'Male', pitch: '-3Hz', rate: '-10%' },
    { id: 'en-US-AriaNeural', label: 'Aria', gender: 'Female' },
    { id: 'en-US-GuyNeural', label: 'Guy', gender: 'Male' },
    { id: 'en-US-ChristopherNeural', label: 'Christopher', gender: 'Male' },
    { id: 'en-US-JennyNeural', label: 'Jenny', gender: 'Female' },
    { id: 'en-US-MichelleNeural', label: 'Michelle', gender: 'Female' },
    { id: 'en-US-EricNeural', label: 'Eric', gender: 'Male' },
    { id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'Female' },
    { id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'Male' },
    { id: 'en-AU-NatashaNeural', label: 'Natasha', gender: 'Female' },
    { id: 'en-AU-WilliamMultilingualNeural', label: 'William', gender: 'Male' },
  ];

  private static readonly GOOGLE_VOICES: TtsVoicePreset[] = [
    { id: 'en-US-Neural2-F', label: 'Neural2 F', gender: 'Female' },
    { id: 'en-US-Neural2-H', label: 'Neural2 H', gender: 'Male' },
    { id: 'en-US-Neural2-I', label: 'Neural2 I', gender: 'Female' },
    { id: 'en-US-Neural2-J', label: 'Neural2 J', gender: 'Male' },
    { id: 'en-US-Wavenet-A', label: 'Wavenet A', gender: 'Male' },
    { id: 'en-US-Wavenet-B', label: 'Wavenet B', gender: 'Female' },
    { id: 'en-US-Wavenet-C', label: 'Wavenet C', gender: 'Male' },
    { id: 'en-US-Wavenet-D', label: 'Wavenet D', gender: 'Female' },
    { id: 'en-GB-Wavenet-A', label: 'Wavenet A', gender: 'Male' },
    { id: 'en-GB-Wavenet-B', label: 'Wavenet B', gender: 'Female' },
  ];

  constructor(
    private readonly config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const { error } = await this.supabase
        .schema('apex')
        .from('server_settings')
        .select('key')
        .limit(1);

      if (error) {
        this.logger.warn('apex.server_settings table not found. Run the SQL to create it.');
      }
    } catch {
      this.logger.warn('Could not verify TTS settings table.');
    }
  }

  async getSettings(): Promise<TtsSettings> {
    try {
      const { data, error } = await this.supabase
        .schema('apex')
        .from('server_settings')
        .select('value')
        .eq('key', 'tts_settings')
        .single();

      if (error || !data) {
        this.logger.log('getSettings: no data found, returning defaults');
        return { ...TtsService.DEFAULT_SETTINGS };
      }

      const saved = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      this.logger.log(`getSettings: retrieved enabled_voices = ${JSON.stringify(saved?.enabled_voices)}`);
      return { ...TtsService.DEFAULT_SETTINGS, ...saved };
    } catch (err) {
      this.logger.error('getSettings error', err);
      return { ...TtsService.DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: Partial<TtsSettings>): Promise<TtsSettings> {
    const current = await this.getSettings();
    const merged = { ...current, ...settings };

    if (settings.enabled_voices !== undefined) {
      merged.enabled_voices = settings.enabled_voices;
    }

    try {
      const { error } = await this.supabase
        .schema('apex')
        .from('server_settings')
        .upsert(
          { key: 'tts_settings', value: JSON.stringify(merged) },
          { onConflict: 'key' },
        );

      if (error) {
        this.logger.error(`Failed to save TTS settings: ${JSON.stringify(error)}`);
        throw new Error(`TTS save failed: ${error.message}`);
      }

      this.logger.log(`TTS settings saved successfully: enabled_voices = ${JSON.stringify(merged.enabled_voices)}`);
      return merged;
    } catch (err: any) {
      this.logger.error(`TTS save error: ${err.message}`);
      throw err;
    }
  }

  getVoices(): { edge: TtsVoicePreset[]; google: TtsVoicePreset[] } {
    return {
      edge: TtsService.EDGE_VOICES,
      google: TtsService.GOOGLE_VOICES,
    };
  }

  async getActiveVoices(): Promise<TtsVoicePreset[]> {
    const settings = await this.getSettings();

    const allVoices = settings.provider === 'google-tts' ? TtsService.GOOGLE_VOICES : TtsService.EDGE_VOICES;
    const enabled = new Set(settings.enabled_voices || []);

    return allVoices
      .filter(v => enabled.has(v.id))
      .map(v => ({ ...v }));
  }

  async getActiveVoicesForUser(): Promise<TtsVoicePreset[]> {
    const settings = await this.getSettings();

    this.logger.log(`getActiveVoicesForUser: enabled_voices = ${JSON.stringify(settings.enabled_voices)}`);

    const allVoices = settings.provider === 'google-tts' ? TtsService.GOOGLE_VOICES : TtsService.EDGE_VOICES;
    const enabledVoices = settings.enabled_voices || [];
    const labels = settings.voice_labels || {};

    if (enabledVoices.length === 0) {
      this.logger.log('getActiveVoicesForUser: no enabled voices, returning empty');
      return [];
    }

    const enabledSet = new Set(enabledVoices);

    const filteredVoices = allVoices
      .filter(v => enabledSet.has(v.id));

    this.logger.log(`getActiveVoicesForUser: filtered ${filteredVoices.length} voices from ${allVoices.length}`);

    return filteredVoices
      .map(v => {
        const customLabel = labels[v.id];
        let displayLabel: string;

        if (customLabel) {
          displayLabel = customLabel;
        } else if (v.gender === 'Male') {
          displayLabel = `${this.extractVoiceBaseName(v.id)} - MALE`;
        } else {
          displayLabel = `${v.label} - ${v.gender}`;
        }

        return {
          ...v,
          label: displayLabel,
        };
      });
  }

  getDefaultVoiceId(): string {
    return TtsService.DEFAULT_SETTINGS.provider === 'google-tts'
      ? TtsService.DEFAULT_SETTINGS.google_voice
      : TtsService.DEFAULT_SETTINGS.edge_voice;
  }

  formatVoiceLabel(voiceId: string, gender: string, customLabel?: string): string {
    if (customLabel) {
      return customLabel;
    }
    const baseName = this.extractVoiceBaseName(voiceId);
    return `${baseName} - ${gender}`;
  }

  extractVoiceBaseName(voiceId: string): string {
    const parts = voiceId.split('-');
    if (parts.length >= 3) {
      const namePart = parts[2];
      const cleanName = namePart
        .replace(/Multilingual/g, '')
        .replace(/Neural$/g, '')
        .replace(/(\d+)/g, '');
      return cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
    }
    return voiceId;
  }

  async synthesize(text: string, voice?: string, overrides?: { pitch?: string; rate?: string }): Promise<{ audio: Buffer; contentType: string } | null> {
    const settings = await this.getSettings();
    const voiceId = voice || (settings.provider === 'google-tts' ? settings.google_voice : settings.edge_voice);

    switch (settings.provider) {
      case 'edge-tts':
        return this.synthesizeEdge(text, voiceId, overrides ?? settings.voice_overrides?.[voiceId]);
      case 'google-tts':
        return this.synthesizeGoogle(text, voiceId, settings.google_api_key);
      case 'webspeech':
      default:
        return null;
    }
  }

  private async synthesizeEdge(text: string, voiceId: string, overrides?: { pitch?: string; rate?: string }): Promise<{ audio: Buffer; contentType: string }> {
    const preset = TtsService.EDGE_VOICES.find(v => v.id === voiceId);
    const pitch = overrides?.pitch?.trim() || preset?.pitch;
    const rate = overrides?.rate?.trim() || preset?.rate;

    const connId = crypto.randomUUID().replace(/-/g, '');
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connId}`;

    // Build SSML
    let prosody = '';
    if (rate) prosody += ` rate="${rate}"`;
    if (pitch) prosody += ` pitch="${pitch}"`;
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voiceId}'><prosody${prosody}>${this.escapeXml(text)}</prosody></voice></speak>`;

    return new Promise<{ audio: Buffer; contentType: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Edge TTS WebSocket timed out'));
      }, 30_000);

      const ws = new WebSocket(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        },
      });

      ws.on('open', () => {
        // Send speech config
        const config = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
        ws.send(config);

        // Send SSML
        const msgId = crypto.randomUUID().replace(/-/g, '');
        const ssmlMsg = `X-RequestId:${msgId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary) {
          // Binary audio data — strip the 2-byte header (WebSocket protocol)
          // The first message has a variable-length header; subsequent ones are just audio
          const str = data.toString('utf-8', 0, Math.min(200, data.length));
          const pathIdx = str.indexOf('Path:audio\r\n');
          if (pathIdx !== -1) {
            const audioStart = pathIdx + 'Path:audio\r\n'.length;
            chunks.push(data.subarray(audioStart));
          } else {
            chunks.push(data);
          }
        }
      });

      ws.on('close', () => {
        clearTimeout(timer);
        if (chunks.length === 0) {
          reject(new Error('Edge TTS returned no audio'));
        } else {
          resolve({ audio: Buffer.concat(chunks), contentType: 'audio/mpeg' });
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`Edge TTS WebSocket error: ${err.message}`));
      });
    });
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private async synthesizeGoogle(text: string, voice: string, apiKey: string): Promise<{ audio: Buffer; contentType: string }> {
    if (!apiKey) {
      const envKey = this.config.get<string>('GOOGLE_TTS_API_KEY');
      if (!envKey) {
        throw new Error('Google TTS API key not configured. Set GOOGLE_TTS_API_KEY or configure in admin panel.');
      }
      apiKey = envKey;
    }

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    const body = {
      input: { text },
      voice: {
        languageCode: voice.startsWith('en-GB') ? 'en-GB' : voice.startsWith('en-AU') ? 'en-AU' : 'en-US',
        name: voice,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Google TTS error ${response.status}: ${errorBody}`);
        throw new Error(`Google TTS failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as { audioContent: string };
      const audio = Buffer.from(result.audioContent, 'base64');
      return { audio, contentType: 'audio/mpeg' };
    } catch (err: any) {
      this.logger.error('Google TTS failed', err.message);
      throw new Error('Google TTS synthesis failed: ' + (err.message || 'unknown error'));
    }
  }
}
