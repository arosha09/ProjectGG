-- Apply before deploying the character-events endpoint. Existing XP is not replayed.
BEGIN;
CREATE TABLE IF NOT EXISTS projectgg.character_xp_events (
  user_id uuid NOT NULL,
  event_id text NOT NULL,
  character_id uuid NOT NULL,
  xp integer NOT NULL CHECK (xp BETWEEN 1 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
-- Deliberately no character FK: deletion must preserve earned XP and retry receipts.
ALTER TABLE projectgg.character_xp_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON projectgg.character_xp_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.award_character_xp_events(in_user_id uuid, in_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  event jsonb;
  prior projectgg.character_xp_events%ROWTYPE;
  event_key text;
  character_key uuid;
  amount integer;
  awarded integer := 0;
  inserted integer;
BEGIN
  IF jsonb_typeof(in_events) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Events must be an array';
  END IF;
  IF jsonb_array_length(in_events) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Provide 1-100 events';
  END IF;
  -- Serialize events for this account, including concurrent retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(in_user_id::text, 721));
  FOR event IN SELECT value FROM jsonb_array_elements(in_events) LOOP
    event_key := event->>'event_id';
    character_key := (event->>'character_id')::uuid;
    amount := (event->>'xp')::integer;
    IF event_key IS NULL OR event_key !~ '^[a-f0-9]{32}$' OR character_key IS NULL
       OR amount IS NULL OR amount NOT BETWEEN 1 AND 100000 THEN
      RAISE EXCEPTION 'Invalid character XP event';
    END IF;
    SELECT * INTO prior FROM projectgg.character_xp_events
      WHERE user_id=in_user_id AND event_id=event_key;
    IF FOUND THEN
      IF prior.character_id<>character_key OR prior.xp<>amount THEN
        RAISE EXCEPTION 'Event ID was reused with different data';
      END IF;
      CONTINUE;
    END IF;
    PERFORM 1 FROM projectgg.game_characters WHERE id=character_key AND user_id=in_user_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Character does not belong to account'; END IF;
    INSERT INTO projectgg.character_xp_events(user_id,event_id,character_id,xp)
      VALUES(in_user_id,event_key,character_key,amount) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted=1 THEN
      -- Ledger insertion and existing account XP award commit or roll back together.
      PERFORM public.award_custom_xp(in_user_id,amount,'project-free-will',event_key);
      awarded := awarded+amount;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('awarded_xp',awarded);
END;
$$;
REVOKE ALL ON FUNCTION public.award_character_xp_events(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_character_xp_events(uuid,jsonb) TO service_role;
COMMIT;
