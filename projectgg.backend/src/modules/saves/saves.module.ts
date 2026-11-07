import { Module } from '@nestjs/common';
import { SavesController } from './saves.controller';
import { SavesService } from './saves.service';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [SavesController],
  providers: [SavesService, supabaseProvider],
  exports: [SavesService],
})
export class SavesModule {}
