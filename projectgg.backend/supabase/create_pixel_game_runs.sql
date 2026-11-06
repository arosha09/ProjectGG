CREATE TABLE IF NOT EXISTS projectgg.pixel_game_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES projectgg.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  enemies_killed INTEGER NOT NULL DEFAULT 0,
  gems_collected INTEGER NOT NULL DEFAULT 0,
  monsters_caught JSONB NOT NULL DEFAULT '[]'::jsonb,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  tickets_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pixel_game_runs_user_id ON projectgg.pixel_game_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_pixel_game_runs_created_at ON projectgg.pixel_game_runs(created_at DESC);
