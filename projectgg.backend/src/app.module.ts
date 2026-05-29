import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { MigrationService } from './database/migration.service';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'src/.env'] }),
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
  ],
  providers: [MigrationService],
})
export class AppModule {}
