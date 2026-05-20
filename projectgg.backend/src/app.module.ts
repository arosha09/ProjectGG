import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './modules/users.module';
import { GamesModule } from './modules/games.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'src/.env'] }),
    UsersModule,
    GamesModule,
    AuthModule,
  ],
})
export class AppModule {}
