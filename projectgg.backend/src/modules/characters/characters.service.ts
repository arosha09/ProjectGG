import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';

@Injectable()
export class CharactersService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}
  private table() { return this.supabase.schema('projectgg').from('game_characters'); }
  private async owned(userId: string, id: string) {
    const { data, error } = await this.table().select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Character not found');
    return data;
  }
  private profile(body: any) {
    const name = String(body?.name ?? body?.character_name ?? '').trim();
    if (!name || name.length > 32) throw new BadRequestException('Character name must be 1-32 characters');
    return { name, data: { ...body, name, character_name: name } };
  }
  async list(userId: string) {
    const { data, error } = await this.table().select('*').eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }
  async create(userId: string, body: any) {
    const profile = this.profile(body);
    // Retries after a lost response must reuse the same game character.
    if (typeof body.local_id === 'string' && body.local_id) {
      const { data: existing, error } = await this.table().select('id').eq('user_id', userId).contains('data', { local_id: body.local_id }).maybeSingle();
      if (error) throw new BadRequestException(error.message);
      if (existing) return this.update(userId, existing.id, body);
    }
    const { data, error } = await this.table().insert({ user_id: userId, ...profile }).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
  async update(userId: string, id: string, body: any) {
    const existing = await this.owned(userId, id);
    const profile = this.profile({ ...existing.data, ...body });
    const { data, error } = await this.table().update({ ...profile, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
  async resetCollection(userId: string, id: string) {
    await this.owned(userId, id);
    const { error } = await this.supabase.schema('projectgg').from('character_collections').delete().eq('character_id', id);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }
  async uploadMugshot(userId: string, id: string, file: any) {
    await this.owned(userId, id);
    const png = Buffer.from([137,80,78,71,13,10,26,10]);
    if (!file?.buffer || file.mimetype !== 'image/png' || file.buffer.length > 5 * 1024 * 1024 || !file.buffer.subarray(0,8).equals(png)) throw new BadRequestException('A PNG image up to 5 MB is required');
    const filename = `characters/${userId}/${id}/mugshot.png`;
    const bucket = this.supabase.storage.from('chat_uploads');
    const { error } = await bucket.upload(filename, file.buffer, { contentType: 'image/png', upsert: true });
    if (error) throw new BadRequestException(error.message);
    const signed = await bucket.createSignedUrl(filename, 315360000);
    if (signed.error || !signed.data?.signedUrl) throw new BadRequestException(signed.error?.message ?? 'Unable to sign mugshot');
    const result = await this.table().update({ mugshot_url: signed.data.signedUrl, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    if (result.error) throw new BadRequestException(result.error.message);
    return { url: signed.data.signedUrl };
  }
  async belongings(userId: string, id: string) {
    await this.owned(userId, id);
    const { data, error } = await this.supabase.schema('projectgg').from('character_collections').select('*').eq('character_id', id);
    if (error) throw new BadRequestException(error.message);
    return { collections: data ?? [] };
  }
  async transferCollection(userId: string, id: string, targetId: string) {
    if (!targetId || targetId === id) throw new BadRequestException('Choose another character');
    await this.owned(userId, id);
    await this.owned(userId, targetId);
    const { error } = await this.supabase.schema('projectgg').from('character_collections').update({ character_id: targetId }).eq('character_id', id);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }
  async remove(userId: string, id: string) {
    const { data, error: lookupError } = await this.table().select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (lookupError) throw new BadRequestException(lookupError.message);
    if (!data) return { success: true };
    // Explicitly confirmed by the player. Handle legacy schemas without cascades.
    for (const table of ['character_collections', 'game_saves']) {
      let query = this.supabase.schema('projectgg').from(table).delete().eq('character_id', id);
      if (table === 'game_saves') query = query.eq('user_id', userId);
      const { error } = await query;
      if (error) throw new BadRequestException(error.message);
    }
    const image = await this.supabase.storage.from('chat_uploads').remove([`characters/${userId}/${id}/mugshot.png`]);
    if (image.error) throw new BadRequestException(image.error.message);
    const { error } = await this.table().delete().eq('id', id).eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }
}
