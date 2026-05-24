import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './modules/users.module';
import { GamesModule } from './modules/games.module';
import { AuthModule } from './auth/auth.module';
import { XpModule } from './modules/xp.module';
import { GamesSyncModule } from './modules/sync/games-sync.module';
import { PlatformConnectionsModule } from './modules/platform-connections/platform-connections.module';
import { ChatModule } from './modules/chat/chat.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'src/.env'] }),
    UsersModule,
    GamesModule,
    GamesSyncModule,
    PlatformConnectionsModule,
    ChatModule,
    AuthModule,
    MailModule,
    XpModule,
  ],
})
export class AppModule {}
