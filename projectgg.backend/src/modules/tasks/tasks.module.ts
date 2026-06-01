import { Module, forwardRef } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { supabaseProvider } from '../../config/supabase.provider';
import { AuthModule } from '../../auth/auth.module';
import { XpModule } from '../xp.module';
import { CardCollectionModule } from '../card-collection/card-collection.module';
import { ChatModule } from '../chat/chat.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, forwardRef(() => XpModule), forwardRef(() => CardCollectionModule), forwardRef(() => ChatModule), RealtimeModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository, supabaseProvider],
  exports: [TasksService],
})
export class TasksModule {}