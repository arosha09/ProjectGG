import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './modules/users.module';
import { GamesModule } from './modules/games.module';
import { AuthModule } from './auth/auth.module';
import { XpModule } from './modules/xp.module';
import { GamesSyncModule } from './modules/sync/games-sync.module';
import { PlatformConnectionsModule } from './modules/platform-connections/platform-connections.module';
import { ChatModule } from './modules/chat/chat.module';
import { VoiceModule } from './modules/voice/voice.module';
import { MailModule } from './mail/mail.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { MusicModule } from './modules/music/music.module';
import { CardCollectionModule } from './modules/card-collection/card-collection.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'src/.env'] }),
    ThrottlerModule.forRoot([{ name: 'short', ttl: 60_000, limit: 30 }]),
    UsersModule,
    GamesModule,
    GamesSyncModule,
    PlatformConnectionsModule,
    ChatModule,
    VoiceModule,
    AuthModule,
    MailModule,
    XpModule,
    TasksModule,
    MusicModule,
    CardCollectionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
