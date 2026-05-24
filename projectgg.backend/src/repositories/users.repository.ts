import { Injectable, InternalServerErrorException, Inject, NotFoundException } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { UserDto } from '../dto/user.dto';

@Injectable()
export class UsersRepository {
    private readonly userFilesBucket = 'user_files';
    private readonly systemFilesBucket = 'system_files';

    constructor(
        @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    ) {}

    async findById(params: { userId?: string; username?: string }): Promise<UserDto | null> {
        let query = this.supabase
            .schema('projectgg')
            .from('users')
            .select('*');

        if (params.userId) {
            query = query.eq('id', params.userId);
        } else if (params.username) {
            query = query.eq('username', params.username);
        } else {
            return null;
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
            throw new InternalServerErrorException(`findById failed: ${error.message}`);
        }

        return (data as UserDto) ?? null;
    }

    async updateProfile(userId: string, updates: { name?: string; username?: string; email?: string; avatar?: string; email_verified?: boolean }): Promise<UserDto | null> {
        const { data, error } = await this.supabase
            .schema('projectgg')
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(`Update profile failed: ${error.message}`);
        }

        return data as UserDto;
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

    async uploadUserAvatar(userId: string, file: Buffer, contentType: string, username: string): Promise<string> {
        const ext = this.getExtension(contentType);
        const filePath = `avatars/${userId}_${username}.${ext}`;
        const { error: uploadError } = await this.supabase.storage
            .from(this.userFilesBucket)
            .upload(filePath, file, {
                contentType,
                upsert: true,
            });

        if (uploadError) {
            throw new InternalServerErrorException(`Avatar upload failed: ${uploadError.message}`);
        }

        const { data } = await this.supabase.storage
            .from(this.userFilesBucket)
            .createSignedUrl(filePath, 604800);

        return `user://${this.userFilesBucket}/${filePath}`;
    }

    async deleteUserAvatar(userId: string): Promise<void> {
        const { data: files } = await this.supabase.storage
            .from(this.userFilesBucket)
            .list('avatars', { search: userId });

        if (files && files.length > 0) {
            const paths = files.map((f: any) => `avatars/${f.name}`);
            await this.supabase.storage
                .from(this.userFilesBucket)
                .remove(paths);
        }
    }

    async getSystemAvatars(): Promise<{ filename: string; url: string }[]> {
        const { data, error } = await this.supabase.storage
            .from(this.systemFilesBucket)
            .list('avatars');

        if (error) {
            throw new InternalServerErrorException(`List system avatars failed: ${error.message}`);
        }

        const avatars = (data || []).filter((f: any) => !f.name.startsWith('.'));

        return avatars.map((f: any) => {
            const { data: urlData } = this.supabase.storage
                .from(this.systemFilesBucket)
                .getPublicUrl(`avatars/${f.name}`);
            return {
                filename: f.name,
                url: urlData?.publicUrl || '',
            };
        });
    }

    async getUserAvatarUrl(userId: string): Promise<string | null> {
        const user = await this.findById({ userId });
        if (!user?.avatar) return null;

        if (user.avatar.startsWith('user://')) {
            const path = user.avatar.replace('user://', '');
            const bucket = this.userFilesBucket;
            const filePath = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
            const { data } = await this.supabase.storage
                .from(bucket)
                .createSignedUrl(filePath, 604800);
            return data?.signedUrl || null;
        }

        if (user.avatar.startsWith('http')) {
            return user.avatar;
        }

        const { data } = this.supabase.storage
            .from(this.systemFilesBucket)
            .getPublicUrl(`avatars/${user.avatar}`);

        return data?.publicUrl || null;
    }
}
