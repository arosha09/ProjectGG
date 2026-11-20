-- XP and rank system tables
-- Run this against the Supabase projectgg schema

CREATE TABLE IF NOT EXISTS projectgg.rank_tiers (
  rank_code TEXT PRIMARY KEY,
  rank_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  min_xp INTEGER NOT NULL DEFAULT 0,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS projectgg.user_xp (
  user_id UUID PRIMARY KEY REFERENCES projectgg.users(id) ON DELETE CASCADE,
  total_xp INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_xp_total_xp ON projectgg.user_xp(total_xp DESC);

CREATE TABLE IF NOT EXISTS projectgg.user_xp_daily (
  user_id UUID PRIMARY KEY REFERENCES projectgg.users(id) ON DELETE CASCADE,
  last_claim_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default rank tiers
INSERT INTO projectgg.rank_tiers (rank_code, rank_name, sort_order, min_xp, image_url) VALUES
  ('VOID',   'Void',        0,  0, 'ranks/VOID.png'),
  ('IC',     'Iron',        1,  100, 'ranks/IC.png'),
  ('HC',     'Hardened',    2,  500, 'ranks/HC.png'),
  ('SF',     'Silver',      3,  1500, 'ranks/SF.png'),
  ('CB',     'Cobalt',      4,  3000, 'ranks/CB.png'),
  ('NF',     'Neon',        5,  6000, 'ranks/NF.png'),
  ('SP',     'Solar',       6,  12000, 'ranks/SP.png'),
  ('ASC',    'Ascendant',   7,  25000, 'ranks/ASC.png')
ON CONFLICT (rank_code) DO NOTHING;

-- -------------------------------------------------------------------
-- RPC: get_user_rank
-- Returns the user's current rank, total XP, and progress to next rank.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION projectgg.get_user_rank(in_user_id UUID)
RETURNS TABLE (
  total_xp INTEGER,
  rank_name TEXT,
  rank_code TEXT,
  rank_sort_order INTEGER,
  next_rank_name TEXT,
  next_rank_code TEXT,
  xp_to_next INTEGER,
  progress_percent NUMERIC
) LANGUAGE plpgsql AS $$
DECLARE
  v_total_xp INTEGER := 0;
  v_current_rank projectgg.rank_tiers%ROWTYPE;
  v_next_rank projectgg.rank_tiers%ROWTYPE;
  v_progress NUMERIC := 0;
  v_xp_to_next INTEGER := 0;
BEGIN
  SELECT COALESCE(total_xp, 0) INTO v_total_xp
  FROM projectgg.user_xp
  WHERE user_id = in_user_id;

  SELECT * INTO v_current_rank
  FROM projectgg.rank_tiers
  WHERE min_xp <= v_total_xp
  ORDER BY sort_order DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_current_rank := (SELECT * FROM projectgg.rank_tiers ORDER BY sort_order ASC LIMIT 1);
  END IF;

  SELECT * INTO v_next_rank
  FROM projectgg.rank_tiers
  WHERE sort_order = v_current_rank.sort_order + 1;

  IF FOUND THEN
    v_xp_to_next := GREATEST(v_next_rank.min_xp - v_total_xp, 0);
    IF v_next_rank.min_xp > v_current_rank.min_xp THEN
      v_progress := ROUND(
        (v_total_xp - v_current_rank.min_xp)::NUMERIC /
        (v_next_rank.min_xp - v_current_rank.min_xp)::NUMERIC * 100,
        2
      );
      IF v_progress < 0 THEN v_progress := 0; END IF;
      IF v_progress > 100 THEN v_progress := 100; END IF;
    END IF;
  ELSE
    v_next_rank := v_current_rank;
    v_xp_to_next := 0;
    v_progress := 100;
  END IF;

  RETURN QUERY
  SELECT
    v_total_xp AS total_xp,
    v_current_rank.rank_name AS rank_name,
    v_current_rank.rank_code AS rank_code,
    v_current_rank.sort_order AS rank_sort_order,
    v_next_rank.rank_name AS next_rank_name,
    v_next_rank.rank_code AS next_rank_code,
    v_xp_to_next AS xp_to_next,
    v_progress AS progress_percent;
END;
$$;

-- -------------------------------------------------------------------
-- RPC: can_claim_daily
-- Returns whether the user can claim the daily login reward today.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION projectgg.can_claim_daily(in_user_id UUID)
RETURNS TABLE (
  can_claim BOOLEAN,
  next_claim TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  v_last_claim DATE;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT last_claim_date INTO v_last_claim
  FROM projectgg.user_xp_daily
  WHERE user_id = in_user_id;

  IF v_last_claim IS NULL OR v_last_claim < v_today THEN
    RETURN QUERY SELECT true AS can_claim, NULL::TEXT AS next_claim;
  ELSE
    RETURN QUERY SELECT false AS can_claim, (v_today + 1)::TEXT AS next_claim;
  END IF;
END;
$$;

-- -------------------------------------------------------------------
-- RPC: award_daily_login
-- Awards daily login XP and updates the daily claim record.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION projectgg.award_daily_login(in_user_id UUID)
RETURNS TABLE (
  xp_earned INTEGER,
  total_xp INTEGER,
  rank_name TEXT,
  can_claim_again TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  v_xp_earned INTEGER := 50;
  v_total_xp INTEGER;
  v_rank_name TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Check if already claimed today
  SELECT EXISTS (
    SELECT 1 FROM projectgg.user_xp_daily
    WHERE user_id = in_user_id AND last_claim_date = CURRENT_DATE
  ) INTO v_exists;

  IF v_exists THEN
    SELECT ux.total_xp, rt.rank_name, (CURRENT_DATE + 1)::TEXT
    INTO v_total_xp, v_rank_name, can_claim_again
    FROM projectgg.user_xp ux
    LEFT JOIN projectgg.rank_tiers rt ON rt.sort_order = (
      SELECT sort_order FROM projectgg.rank_tiers
      WHERE min_xp <= ux.total_xp
      ORDER BY sort_order DESC LIMIT 1
    )
    WHERE ux.user_id = in_user_id;

    xp_earned := 0;
    total_xp := COALESCE(v_total_xp, 0);
    rank_name := COALESCE(v_rank_name, 'Void');
    RETURN;
  END IF;

  -- Upsert user_xp
  SELECT EXISTS (SELECT 1 FROM projectgg.user_xp WHERE user_id = in_user_id) INTO v_exists;

  IF v_exists THEN
    UPDATE projectgg.user_xp
    SET total_xp = total_xp + v_xp_earned, updated_at = NOW()
    WHERE user_id = in_user_id
    RETURNING total_xp INTO v_total_xp;
  ELSE
    INSERT INTO projectgg.user_xp (user_id, total_xp, updated_at)
    VALUES (in_user_id, v_xp_earned, NOW())
    RETURNING total_xp INTO v_total_xp;
  END IF;

  -- Upsert daily claim record
  SELECT EXISTS (SELECT 1 FROM projectgg.user_xp_daily WHERE user_id = in_user_id) INTO v_exists;

  IF v_exists THEN
    UPDATE projectgg.user_xp_daily
    SET last_claim_date = CURRENT_DATE, updated_at = NOW()
    WHERE user_id = in_user_id;
  ELSE
    INSERT INTO projectgg.user_xp_daily (user_id, last_claim_date, updated_at)
    VALUES (in_user_id, CURRENT_DATE, NOW());
  END IF;

  -- Get rank name
  SELECT rt.rank_name INTO v_rank_name
  FROM projectgg.user_xp ux
  LEFT JOIN projectgg.rank_tiers rt ON rt.sort_order = (
    SELECT sort_order FROM projectgg.rank_tiers
    WHERE min_xp <= ux.total_xp
    ORDER BY sort_order DESC LIMIT 1
  )
  WHERE ux.user_id = in_user_id;

  xp_earned := v_xp_earned;
  total_xp := COALESCE(v_total_xp, 0);
  rank_name := COALESCE(v_rank_name, 'Void');
  can_claim_again := (CURRENT_DATE + 1)::TEXT;

  RETURN;
END;
$$;

-- -------------------------------------------------------------------
-- RPC: get_leaderboard
-- Returns the top users by total XP with rank info.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION projectgg.get_leaderboard(in_limit INTEGER)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  name TEXT,
  avatar TEXT,
  total_xp INTEGER,
  rank_name TEXT,
  rank_code TEXT,
  rank_position INTEGER
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ux.user_id,
    u.username,
    u.name,
    u.avatar,
    ux.total_xp,
    rt.rank_name,
    rt.rank_code,
    ROW_NUMBER() OVER (ORDER BY ux.total_xp DESC) AS rank_position
  FROM projectgg.user_xp ux
  JOIN projectgg.users u ON u.id = ux.user_id
  LEFT JOIN projectgg.rank_tiers rt ON rt.sort_order = (
    SELECT sort_order FROM projectgg.rank_tiers
    WHERE min_xp <= ux.total_xp
    ORDER BY sort_order DESC LIMIT 1
  )
  ORDER BY ux.total_xp DESC
  LIMIT GREATEST(in_limit, 1);
END;
$$;
