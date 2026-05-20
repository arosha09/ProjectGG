import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from 'src/config/supabase.provider';
import { UserDto } from '../dto/user.dto';

@Injectable()
export class UsersRepository {
    constructor(
        @Inject(SUPABASE_CLIENT) private readonly supabase: any,
    ) {}

    async findById(params: { userId?: string; username?: string }): Promise<UserDto | null> {
        const functionName = 'get_user_details';
        const { data, error } = await this.supabase.rpc(functionName, {
            user_id: params.userId ?? null,
            in_username: params.username ?? null,
        });

        if (error) {
            throw new InternalServerErrorException(`${functionName} failed: ${error.message}`);
        }

        const rows = (data ?? []) as UserDto[];
        return rows[0] ?? null;
    }
}