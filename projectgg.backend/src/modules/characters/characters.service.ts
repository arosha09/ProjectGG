import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

@Injectable()
export class CharactersService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  async list(userId: string) {
    const { data } = await this.supabase
      .schema('projectgg')
      .from('game_characters')
      .select('*')
      .eq('user_id', userId);
    return data ?? [];
  }

  async create(userId: string, body: any) {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('game_characters')
      .insert({ user_id: userId, name: body.name ?? 'New Character', data: body })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async resetCollection(userId: string, id: string) {
    await this.supabase
      .schema('projectgg')
      .from('character_collections')
      .delete()
      .eq('character_id', id);
    return { success: true };
  }

  async uploadMugshot(userId: string, id: string, file: any) {
    if (!file) throw new BadRequestException('No file');
    const filename = `mugshot_${id}_${Date.now()}.png`;
    const { error } = await this.supabase.storage.from('chat_uploads').upload(filename, file.buffer, { contentType: file.mimetype });
    if (error) throw new BadRequestException(error.message);
    const { data } = await this.supabase.storage.from('chat_uploads').createSignedUrl(filename, 315360000);
    await this.supabase.schema('projectgg').from('game_characters').update({ mugshot_url: data?.signedUrl ?? '' }).eq('id', id).eq('user_id', userId);
    return { url: data?.signedUrl ?? '' };
  }

  async remove(userId: string, id: string) {
    await this.supabase.schema('projectgg').from('game_characters').delete().eq('id', id).eq('user_id', userId);
    return { success: true };
  }
}