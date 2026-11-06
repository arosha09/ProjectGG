CREATE TABLE IF NOT EXISTS projectgg.game_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  data JSONB,
  mugshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projectgg.character_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES projectgg.game_characters(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT now()
);