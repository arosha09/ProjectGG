import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

interface SaveDto {
  character_id: string;
  save_data: any;
}

@Injectable()
export class SavesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  async upload(userId: string, dto: SaveDto) {
    if (!dto.character_id || dto.save_data === undefined) {
      throw new BadRequestException('character_id and save_data are required');
    }
    const { error } = await this.supabase
      .schema('projectgg')
      .from('game_saves')
      .upsert(
        {
          user_id: userId,
          character_id: dto.character_id,
          save_data: dto.save_data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: ['user_id', 'character_id'] },
      );
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  async download(userId: string, character_id: string) {
    if (!character_id) {
      throw new BadRequestException('character_id is required');
    }
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('game_saves')
      .select('save_data, updated_at')
      .eq('user_id', userId)
      .eq('character_id', character_id);
    if (error) throw new NotFoundException(error.message);
    if (!data || data.length === 0) return null;
    return data[0];
  }
}
