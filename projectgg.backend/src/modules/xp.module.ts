import { Module, forwardRef } from '@nestjs/common';
import { XpController } from 'src/controllers/xp.controller';
import { XpService } from 'src/services/xp.service';
import { XpRepository } from 'src/repositories/xp.repository';
import { supabaseProvider } from 'src/config/supabase.provider';
import { AuthModule } from 'src/auth/auth.module';
import { ChatModule } from 'src/modules/chat/chat.module';

@Module({
  imports: [AuthModule, forwardRef(() => ChatModule)],
  controllers: [XpController],
  providers: [XpService, XpRepository, supabaseProvider],
  exports: [XpService],
})
export class XpModule {}
