import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  imports: [MulterModule.register({ dest: './uploads' })],
  controllers: [CharactersController],
  providers: [CharactersService, supabaseProvider],
  exports: [CharactersService],
})
export class CharactersModule {}