import { Module } from '@nestjs/common';
import { B2AuthService } from './b2-auth.service';
import { B2AuthController } from './b2-auth.controller';

@Module({
  providers: [B2AuthService],
  controllers: [B2AuthController],
  exports: [B2AuthService],
})
export class B2AuthModule {}
