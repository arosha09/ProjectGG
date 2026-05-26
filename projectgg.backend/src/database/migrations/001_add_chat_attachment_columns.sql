ALTER TABLE projectgg.chat_messages
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS sticker_url TEXT;

GRANT SELECT ON projectgg.gg_server_members TO service_role;
