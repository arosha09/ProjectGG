import { Module } from '@nestjs/common';
import { supabaseProvider } from '../../config/supabase.provider';
import { CallGateway } from './call.gateway';

@Module({
  providers: [CallGateway, supabaseProvider],
  exports: [CallGateway],
})
export class CallModule {}
