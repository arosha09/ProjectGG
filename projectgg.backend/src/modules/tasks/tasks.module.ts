import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { supabaseProvider } from '../../config/supabase.provider';
import { XpService } from '../../services/xp.service';
import { XpModule } from '../xp.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule, XpModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository, supabaseProvider],
  exports: [TasksService],
})
export class TasksModule {}
