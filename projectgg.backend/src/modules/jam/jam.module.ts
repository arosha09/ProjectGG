import { Module } from '@nestjs/common';
import { JamController } from './jam.controller';
import { JamService } from './jam.service';
import { JamGateway } from './jam.gateway';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [JamController],
  providers: [JamService, JamGateway, supabaseProvider],
  exports: [JamService, JamGateway],
})
export class JamModule {}
