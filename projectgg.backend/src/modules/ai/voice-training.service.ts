import { Injectable, Logger, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../config/supabase.provider';
import { VoiceFingerprint } from './ai.types';

@Injectable()
export class VoiceTrainingService {
  private readonly logger = new Logger(VoiceTrainingService.name);
  private readonly bucketName = 'ai-voice-recordings';
  private readonly maxRecordings = 10;

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  async uploadRecording(
    userId: string,
    audioBuffer: Buffer,
    recordingIndex: number,
    fingerprint?: VoiceFingerprint,
  ): Promise<{ success: boolean; message: string; progress?: number }> {
    try {
      const paddedIndex = String(recordingIndex + 1).padStart(3, '0');
      const path = `${userId}/recording-${paddedIndex}.webm`;

      const { error: uploadError } = await this.supabase.storage
        .from(this.bucketName)
        .upload(path, audioBuffer, {
          contentType: 'audio/webm',
          upsert: true,
        });

      if (uploadError) {
        this.logger.error(`Failed to upload recording: ${uploadError.message}`);
        return { success: false, message: 'Failed to upload recording' };
      }

      const recordings = await this.listRecordings(userId);
      let progress = recordings.length;

      if (progress > this.maxRecordings) {
        const sorted = recordings.sort((a, b) => {
          const numA = parseInt(a.match(/recording-(\d+)\.webm/)?.[1] || '0', 10);
          const numB = parseInt(b.match(/recording-(\d+)\.webm/)?.[1] || '0', 10);
          return numA - numB;
        });

        const oldest = sorted.slice(0, progress - this.maxRecordings);
        for (const file of oldest) {
          await this.supabase.storage.from(this.bucketName).remove([file]);
        }

        progress = this.maxRecordings;
      }

      if (fingerprint && progress >= this.maxRecordings) {
        await this.saveProfile(userId, {
          voiceFingerprint: fingerprint,
          trainingCompleted: true,
          trainingCount: this.maxRecordings,
        });
      }

      return {
        success: true,
        message: progress >= this.maxRecordings
          ? 'Voice training complete! Profile saved.'
          : `Recording ${progress}/${this.maxRecordings} saved`,
        progress,
      };
    } catch (error) {
      this.logger.error(`Voice upload error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async uploadFingerprint(
    userId: string,
    fingerprint: VoiceFingerprint,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const recordings = await this.listRecordings(userId);
      const count = Math.min(recordings.length, this.maxRecordings);

      await this.saveProfile(userId, {
        voiceFingerprint: fingerprint,
        trainingCompleted: count >= this.maxRecordings,
        trainingCount: count,
      });

      return {
        success: true,
        message: count >= this.maxRecordings
          ? 'Voice profile saved successfully.'
          : `Fingerprint saved. Complete ${this.maxRecordings} recordings to finalize.`,
      };
    } catch (error) {
      this.logger.error(`Upload fingerprint error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async verifySpeaker(userId: string, audioFingerprint: VoiceFingerprint): Promise<boolean> {
    try {
      const profile = await this.getProfile(userId);
      if (!profile?.voice_fingerprint || !profile.training_completed) {
        return false;
      }

      return this.compareFingerprints(profile.voice_fingerprint, audioFingerprint);
    } catch (error) {
      this.logger.error(`Speaker verification error: ${error.message}`);
      return false;
    }
  }

  private compareFingerprints(stored: VoiceFingerprint, sample: VoiceFingerprint): boolean {
    const tolerance = 0.25;
    let totalDistance = 0;
    let dimensions = 0;

    const pitchMinDist = Math.abs(stored.pitch.min - sample.pitch.min) /
      Math.max(stored.pitch.min, sample.pitch.min, 1);
    totalDistance += pitchMinDist;
    dimensions++;

    const pitchMaxDist = Math.abs(stored.pitch.max - sample.pitch.max) /
      Math.max(stored.pitch.max, sample.pitch.max, 1);
    totalDistance += pitchMaxDist;
    dimensions++;

    const pitchAvgDist = Math.abs(stored.pitch.avg - sample.pitch.avg) /
      Math.max(stored.pitch.avg, sample.pitch.avg, 1);
    totalDistance += pitchAvgDist;
    dimensions++;

    const rateDist = Math.abs(stored.speakingRate - sample.speakingRate) /
      Math.max(stored.speakingRate, sample.speakingRate, 1);
    totalDistance += rateDist;
    dimensions++;

    const formantCount = Math.min(stored.formants.length, sample.formants.length);
    for (let i = 0; i < formantCount; i++) {
      const fDist = Math.abs(stored.formants[i] - sample.formants[i]) /
        Math.max(stored.formants[i], sample.formants[i], 1);
      totalDistance += fDist;
      dimensions++;
    }

    if (dimensions === 0) return false;

    const similarity = totalDistance / dimensions;
    this.logger.debug(`Speaker similarity: ${(1 - similarity).toFixed(3)} (threshold: ${tolerance})`);
    return similarity < tolerance;
  }

  async listRecordings(userId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(userId, { limit: 50 });

      if (error) {
        this.logger.warn(`Failed to list recordings: ${error.message}`);
        return [];
      }

      return (data || [])
        .filter(f => f.name.startsWith('recording-') && f.name.endsWith('.webm'))
        .map(f => `${userId}/${f.name}`);
    } catch (error) {
      this.logger.warn(`List recordings error: ${error.message}`);
      return [];
    }
  }

  async getProfile(userId: string): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('ai_voice_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Failed to get voice profile: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      this.logger.error(`Get profile error: ${error.message}`);
      return null;
    }
  }

  async saveProfile(
    userId: string,
    profileData: {
      voiceFingerprint?: VoiceFingerprint;
      customVocabulary?: string[];
      trainingCompleted?: boolean;
      trainingCount?: number;
      customWakePhrase?: string;
    },
  ): Promise<boolean> {
    try {
      const existing = await this.getProfile(userId);

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (profileData.voiceFingerprint) {
        updateData.voice_fingerprint = profileData.voiceFingerprint;
      }
      if (profileData.customVocabulary) {
        updateData.custom_vocabulary = profileData.customVocabulary;
      }
      if (profileData.trainingCompleted !== undefined) {
        updateData.training_completed = profileData.trainingCompleted;
      }
      if (profileData.trainingCount !== undefined) {
        updateData.training_count = profileData.trainingCount;
      }
      if (profileData.customWakePhrase) {
        updateData.custom_wake_phrase = profileData.customWakePhrase;
      }

      if (existing) {
        const { error } = await this.supabase
          .from('ai_voice_profiles')
          .update(updateData)
          .eq('user_id', userId);

        if (error) {
          this.logger.error(`Failed to update profile: ${error.message}`);
          return false;
        }
      } else {
        const { error } = await this.supabase
          .from('ai_voice_profiles')
          .insert({
            user_id: userId,
            voice_fingerprint: profileData.voiceFingerprint || {},
            custom_vocabulary: profileData.customVocabulary || [],
            training_completed: profileData.trainingCompleted || false,
            training_count: profileData.trainingCount || 0,
            custom_wake_phrase: profileData.customWakePhrase || 'Hey APEX',
          });

        if (error) {
          this.logger.error(`Failed to create profile: ${error.message}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Save profile error: ${error.message}`);
      return false;
    }
  }

  async isSpeakerVerified(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;

    try {
      const profile = await this.getProfile(userId);
      return profile?.training_completed === true;
    } catch (error) {
      return false;
    }
  }

  async getCustomVocabulary(userId: string | undefined): Promise<string[]> {
    if (!userId) return [];

    try {
      const profile = await this.getProfile(userId);
      return profile?.custom_vocabulary || [];
    } catch (error) {
      return [];
    }
  }

  async addCustomVocabulary(userId: string, words: string[]): Promise<boolean> {
    try {
      const profile = await this.getProfile(userId);
      const currentVocabulary = profile?.custom_vocabulary || [];
      const newVocabulary = [...new Set([...currentVocabulary, ...words])];

      return await this.saveProfile(userId, { customVocabulary: newVocabulary });
    } catch (error) {
      this.logger.error(`Add vocabulary error: ${error.message}`);
      return false;
    }
  }

  async deleteProfile(userId: string): Promise<boolean> {
    try {
      const recordings = await this.listRecordings(userId);
      if (recordings.length > 0) {
        await this.supabase.storage.from(this.bucketName).remove(recordings);
      }

      const { error } = await this.supabase
        .from('ai_voice_profiles')
        .delete()
        .eq('user_id', userId);

      if (error) {
        this.logger.error(`Failed to delete profile: ${error.message}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Delete profile error: ${error.message}`);
      return false;
    }
  }

  async getTrainingStatus(userId: string): Promise<{ completed: boolean; count: number }> {
    try {
      const profile = await this.getProfile(userId);
      return {
        completed: profile?.training_completed || false,
        count: profile?.training_count || 0,
      };
    } catch (error) {
      return { completed: false, count: 0 };
    }
  }
}
