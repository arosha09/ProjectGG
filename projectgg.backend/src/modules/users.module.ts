import { Module } from '@nestjs/common';
import { UsersController } from 'src/controllers/users.controller';
import { UsersService } from 'src/services/users.service';
import { UsersRepository } from 'src/repositories/users.repository';
import { supabaseProvider } from 'src/config/supabase.provider';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, supabaseProvider],
  exports: [UsersService],
})
export class UsersModule {}
