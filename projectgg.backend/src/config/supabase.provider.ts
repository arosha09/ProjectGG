import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

export const supabaseProvider = {
  provide: SUPABASE_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): SupabaseClient => {
    const url = configService.get<string>('SUPABASE_URL');
    const key = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    }

    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        transport: WebSocket as any,
      },
    });
  },
};
