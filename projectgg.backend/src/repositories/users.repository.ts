import {
  Injectable,
  InternalServerErrorException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { UserDto } from '../dto/user.dto';

@Injectable()
export class UsersRepository {
  private readonly userFilesBucket = 'user_files';
  private readonly systemFilesBucket = 'system_files';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: any) {}

  // Sign a URL with proper per-segment encoding.
  // Uses signed URLs (not public URLs) because the bucket isn't publicly readable.
  private async signFileUrl(
    bucket: string,
    path: string,
    expiresIn = 315360000,
  ): Promise<string> {
    const encoded = path
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(encoded, expiresIn);
    if (error) {
      console.error(`signFileUrl error [${bucket}/${path}]:`, error.message);
    }
    return data?.signedUrl || '';
  }

  async findById(params: {
    userId?: string;
    username?: string;
  }): Promise<UserDto | null> {
    let query = this.supabase.schema('projectgg').from('users').select('*');

    if (params.userId) {
      query = query.eq('id', params.userId);
    } else if (params.username) {
      query = query.eq('username', params.username);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `findById failed: ${error.message}`,
      );
    }

    return (data as UserDto) ?? null;
  }

  async updateProfile(
    userId: string,
    updates: {
      name?: string;
      username?: string;
      email?: string;
      avatar?: string;
      email_verified?: boolean;
      cursor_preference?: string;
      sound_profile?: string;
      allow_incoming_nudges?: boolean;
      disabled_notification_kinds?: string[];
    },
  ): Promise<UserDto | null> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Update profile failed: ${error.message}`,
      );
    }

    return data as UserDto;
  }

  async getUserSettings(userId: string): Promise<{
    sound_profile: string;
    allow_incoming_nudges: boolean;
    disabled_notification_kinds: string[];
  } | null> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select(
        'sound_profile, allow_incoming_nudges, disabled_notification_kinds',
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `getUserSettings failed: ${error.message}`,
      );
    }

    return data ?? null;
  }

  async updateUserSettings(
    userId: string,
    updates: {
      sound_profile?: string;
      allow_incoming_nudges?: boolean;
      disabled_notification_kinds?: string[];
    },
  ): Promise<{
    sound_profile: string;
    allow_incoming_nudges: boolean;
    disabled_notification_kinds: string[];
  } | null> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select(
        'sound_profile, allow_incoming_nudges, disabled_notification_kinds',
      )
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `updateUserSettings failed: ${error.message}`,
      );
    }

    return data;
  }

  private getExtension(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/avif': 'avif',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    };
    return map[contentType] || 'png';
  }

  async uploadUserAvatar(
    userId: string,
    file: Buffer,
    contentType: string,
    username: string,
  ): Promise<string> {
    const ext = this.getExtension(contentType);
    const filePath = `avatars/${userId}_${username}.${ext}`;
    const { error: uploadError } = await this.supabase.storage
      .from(this.userFilesBucket)
      .upload(filePath, file, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Avatar upload failed: ${uploadError.message}`,
      );
    }

    const encodedUploadPath = filePath
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    const { data } = await this.supabase.storage
      .from(this.userFilesBucket)
      .createSignedUrl(encodedUploadPath, 604800);

    return `user://${this.userFilesBucket}/${filePath}`;
  }

  async deleteUserAvatar(userId: string): Promise<void> {
    const { data: files } = await this.supabase.storage
      .from(this.userFilesBucket)
      .list('avatars', { search: userId });

    if (files && files.length > 0) {
      const paths = files.map((f: any) => `avatars/${f.name}`);
      await this.supabase.storage.from(this.userFilesBucket).remove(paths);
    }
  }

  async getSystemAvatars(): Promise<
    {
      category: string;
      avatars: { filename: string; url: string; path: string }[];
    }[]
  > {
    const { data: rootItems, error: rootErr } = await this.supabase.storage
      .from(this.systemFilesBucket)
      .list('avatars');

    if (rootErr) {
      throw new InternalServerErrorException(
        `List system avatars failed: ${rootErr.message}`,
      );
    }

    const categories: { name: string; path: string }[] = [];
    const rootFiles: { filename: string; path: string }[] = [];

    for (const item of rootItems || []) {
      if (item.name.startsWith('.')) continue;
      if (item.id === null) {
        categories.push({ name: item.name, path: `avatars/${item.name}` });
      } else {
        rootFiles.push({ filename: item.name, path: `avatars/${item.name}` });
      }
    }

    const result: {
      category: string;
      avatars: { filename: string; url: string; path: string }[];
    }[] = [];

    const toSignedEntry = async (filename: string, filePath: string) => {
      const url = await this.signFileUrl(this.systemFilesBucket, filePath);
      return { filename, url, path: filePath };
    };

    if (rootFiles.length > 0) {
      const entries = await Promise.all(
        rootFiles.map((f) => toSignedEntry(f.filename, f.path)),
      );
      result.push({ category: '', avatars: entries });
    }

    for (const cat of categories) {
      const { data: catFiles, error: catErr } = await this.supabase.storage
        .from(this.systemFilesBucket)
        .list(cat.path);

      if (catErr) continue;

      const files = (catFiles || [])
        .filter((f: any) => !f.name.startsWith('.') && f.id !== null)
        .map((f: any) => ({ filename: f.name, path: `${cat.path}/${f.name}` }));

      if (files.length > 0) {
        const entries = await Promise.all(
          files.map((f) => toSignedEntry(f.filename, f.path)),
        );
        result.push({ category: cat.name, avatars: entries });
      }
    }

    return result;
  }

  async validateSystemAvatarPath(
    path: string,
  ): Promise<{ url: string } | null> {
    const url = await this.signFileUrl(this.systemFilesBucket, path);
    return url ? { url } : null;
  }

  async getUserAvatarUrl(userId: string): Promise<string | null> {
    const user = await this.findById({ userId });
    if (!user?.avatar) return null;

    if (user.avatar.startsWith('user://')) {
      const path = user.avatar.replace('user://', '');
      const bucket = this.userFilesBucket;
      const filePath = path.startsWith(`${bucket}/`)
        ? path.slice(bucket.length + 1)
        : path;
      const encodedPath = filePath
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      const { data } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(encodedPath, 604800);
      return data?.signedUrl || null;
    }

    if (user.avatar.startsWith('http')) {
      return user.avatar;
    }

    return this.signFileUrl(this.systemFilesBucket, `avatars/${user.avatar}`);
  }

  async getUserTtsVoice(userId: string): Promise<{ selected_voice: string } | null> {
    const { data, error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .select('tts_voice')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `getUserTtsVoice failed: ${error.message}`,
      );
    }

    return data?.tts_voice ? { selected_voice: data.tts_voice } : null;
  }

  async updateUserTtsVoice(userId: string, voiceId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('projectgg')
      .from('users')
      .update({ tts_voice: voiceId })
      .eq('id', userId);

    if (error) {
      throw new InternalServerErrorException(
        `updateUserTtsVoice failed: ${error.message}`,
      );
    }
  }
}
