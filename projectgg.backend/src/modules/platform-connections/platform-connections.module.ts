import { Module } from '@nestjs/common';
import { PlatformConnectionsService } from './platform-connections.service';
import { PlatformConnectionsController } from './platform-connections.controller';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [PlatformConnectionsController],
  providers: [PlatformConnectionsService, supabaseProvider],
  exports: [PlatformConnectionsService],
})
export class PlatformConnectionsModule {}
