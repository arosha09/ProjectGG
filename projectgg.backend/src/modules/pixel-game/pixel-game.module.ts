import { Module, forwardRef } from '@nestjs/common';
import { PixelGameController } from './pixel-game.controller';
import { PixelGameService } from './pixel-game.service';
import { supabaseProvider } from '../../config/supabase.provider';
import { AuthModule } from '../../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { XpModule } from '../xp.module';
import { CardCollectionModule } from '../card-collection/card-collection.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    AuthModule,
    RealtimeModule,
    forwardRef(() => XpModule),
    forwardRef(() => CardCollectionModule),
    forwardRef(() => ChatModule),
  ],
  controllers: [PixelGameController],
  providers: [PixelGameService, supabaseProvider],
})
export class PixelGameModule {}
