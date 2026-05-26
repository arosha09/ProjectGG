import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  private async runMigrations() {
    try {
      this.logger.log('Running schema migrations...');

      const dbUrl = this.configService.get<string>('SUPABASE_DATABASE_URL');
      if (!dbUrl) {
        this.logger.warn('SUPABASE_DATABASE_URL not set — skipping auto-migration. Run 004_fix_friends_dm_column_types.sql manually in Supabase SQL editor.');
        return;
      }

      // We need pg to run raw SQL. If pg isn't available, skip.
      let pg: any;
      try {
        pg = require('pg');
      } catch {
        this.logger.warn('pg module not available — skipping auto-migration.');
        return;
      }

      const pool = new pg.Pool({ connectionString: dbUrl });
      const client = await pool.connect();

      try {
        // Migration 003: gg_server_members.role -> roles text[]
        await client.query(`
          DO $$ BEGIN
            ALTER TABLE projectgg.gg_server_members RENAME COLUMN role TO roles;
            ALTER TABLE projectgg.gg_server_members ALTER COLUMN roles TYPE text[] USING ARRAY[roles];
          EXCEPTION WHEN undefined_column THEN
            RAISE NOTICE 'column role does not exist, skipping';
          WHEN duplicate_column THEN
            RAISE NOTICE 'column roles already exists, skipping';
          END $$;
        `);
        this.logger.log('Migration 003 (roles array) applied');

        // Migration 004: Fix friends and dm_conversation_members column types
        await client.query(`
          DO $$ BEGIN
            TRUNCATE TABLE projectgg.friends;
            TRUNCATE TABLE projectgg.dm_conversation_members;

            ALTER TABLE projectgg.friends DROP COLUMN IF EXISTS user_id;
            ALTER TABLE projectgg.friends ADD COLUMN user_id uuid NOT NULL;

            ALTER TABLE projectgg.friends DROP COLUMN IF EXISTS friend_id;
            ALTER TABLE projectgg.friends ADD COLUMN friend_id uuid NOT NULL;

            ALTER TABLE projectgg.friends DROP COLUMN IF EXISTS action_user_id;
            ALTER TABLE projectgg.friends ADD COLUMN action_user_id uuid NOT NULL;

            ALTER TABLE projectgg.dm_conversation_members DROP COLUMN IF EXISTS user_id;
            ALTER TABLE projectgg.dm_conversation_members ADD COLUMN user_id uuid NOT NULL;
          EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Tables do not exist yet, skipping migration';
          END $$;
        `);

        this.logger.log('Migration 004 applied successfully');

        // Migration 006: Channel allowed roles for private channels
        await client.query(`
          CREATE TABLE IF NOT EXISTS projectgg.gg_channel_allowed_roles (
            channel_id INT NOT NULL REFERENCES projectgg.gg_channels(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            PRIMARY KEY (channel_id, role)
          );
        `);
        this.logger.log('Migration 006 (channel allowed roles) applied');

        // Migration 007: Notifications table
        await client.query(`
          CREATE TABLE IF NOT EXISTS projectgg.notifications (
            id BIGSERIAL PRIMARY KEY,
            user_id UUID NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            data JSONB,
            read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
            ON projectgg.notifications (user_id, read, created_at DESC);
        `);
        this.logger.log('Migration 007 (notifications) applied');
      } finally {
        client.release();
        await pool.end();
      }
    } catch (err: any) {
      this.logger.error(`Migration failed: ${err.message}`);
    }
  }
}
