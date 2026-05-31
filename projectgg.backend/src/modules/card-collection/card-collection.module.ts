import { Module } from '@nestjs/common';
import { CardCollectionController } from './card-collection.controller';
import { CardCollectionService } from './card-collection.service';
import { CardCollectionRepository } from './card-collection.repository';
import { supabaseProvider } from '../../config/supabase.provider';
import { AuthModule } from '../../auth/auth.module';
import { XpModule } from '../xp.module';

@Module({
  imports: [AuthModule, XpModule],
  controllers: [CardCollectionController],
  providers: [CardCollectionService, CardCollectionRepository, supabaseProvider],
  exports: [CardCollectionService],
})
export class CardCollectionModule {}
