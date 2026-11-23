-- Fix: ambiguous column reference "total_xp" in award_daily_login
-- Drop and recreate both functions with local variables to avoid ambiguity.

DROP FUNCTION IF EXISTS public.award_daily_login(uuid);
DROP FUNCTION IF EXISTS public.get_user_rank(uuid);

CREATE OR REPLACE FUNCTION public.get_user_rank(in_user_id uuid)
RETURNS TABLE (
  total_xp integer,
  rank_name text,
  rank_code text,
  rank_sort_order integer,
  next_rank_name text,
  next_rank_code text,
  xp_to_next integer,
  progress_percent numeric
) LANGUAGE plpgsql AS $$
DECLARE
  v_total_xp integer := 0;
  v_current_rank record;
  v_next_rank record;
  v_progress numeric := 0;
  v_xp_to_next integer := 0;
BEGIN
  SELECT COALESCE(ux.total_xp, 0) INTO v_total_xp
  FROM projectgg.user_xp ux
  WHERE ux.user_id = in_user_id;

  SELECT * INTO v_current_rank
  FROM projectgg.rank_tiers
  WHERE min_xp <= v_total_xp
  ORDER BY sort_order DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_current_rank
    FROM projectgg.rank_tiers
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  SELECT * INTO v_next_rank
  FROM projectgg.rank_tiers
  WHERE sort_order = v_current_rank.sort_order + 1;

  IF FOUND THEN
    v_xp_to_next := GREATEST(v_next_rank.min_xp - v_total_xp, 0);
    IF v_next_rank.min_xp > v_current_rank.min_xp THEN
      v_progress := ROUND(
        (v_total_xp - v_current_rank.min_xp)::numeric /
        (v_next_rank.min_xp - v_current_rank.min_xp)::numeric * 100,
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

CREATE OR REPLACE FUNCTION public.award_daily_login(in_user_id uuid)
RETURNS TABLE (
  xp_earned integer,
  total_xp integer,
  rank_name text,
  can_claim_again text
) LANGUAGE plpgsql AS $$
DECLARE
  v_xp_earned integer := 50;
  v_total_xp integer := 0;
  v_rank_name text := 'Void';
  v_exists boolean := false;
BEGIN
  -- Check if already claimed today
  SELECT EXISTS (
    SELECT 1 FROM projectgg.user_xp_daily uxd
    WHERE uxd.user_id = in_user_id
      AND uxd.last_claim_date = CURRENT_DATE
  ) INTO v_exists;

  IF v_exists THEN
    SELECT COALESCE(ux.total_xp, 0), COALESCE(rt.rank_name, 'Void')
    INTO v_total_xp, v_rank_name
    FROM projectgg.user_xp ux
    LEFT JOIN projectgg.rank_tiers rt ON rt.sort_order = (
      SELECT rt2.sort_order
      FROM projectgg.rank_tiers rt2
      WHERE rt2.min_xp <= ux.total_xp
      ORDER BY rt2.sort_order DESC
      LIMIT 1
    )
    WHERE ux.user_id = in_user_id;

    xp_earned := 0;
    total_xp := v_total_xp;
    rank_name := v_rank_name;
    can_claim_again := (CURRENT_DATE + 1)::text;
    RETURN;
  END IF;

  -- Upsert user_xp
  SELECT EXISTS (SELECT 1 FROM projectgg.user_xp ux WHERE ux.user_id = in_user_id)
  INTO v_exists;

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
  SELECT EXISTS (SELECT 1 FROM projectgg.user_xp_daily uxd WHERE uxd.user_id = in_user_id)
  INTO v_exists;

  IF v_exists THEN
    UPDATE projectgg.user_xp_daily
    SET last_claim_date = CURRENT_DATE, updated_at = NOW()
    WHERE user_id = in_user_id;
  ELSE
    INSERT INTO projectgg.user_xp_daily (user_id, last_claim_date, updated_at)
    VALUES (in_user_id, CURRENT_DATE, NOW());
  END IF;

  -- Get rank name
  SELECT COALESCE(rt.rank_name, 'Void')
  INTO v_rank_name
  FROM projectgg.user_xp ux
  LEFT JOIN projectgg.rank_tiers rt ON rt.sort_order = (
    SELECT rt2.sort_order
    FROM projectgg.rank_tiers rt2
    WHERE rt2.min_xp <= ux.total_xp
    ORDER BY rt2.sort_order DESC
    LIMIT 1
  )
  WHERE ux.user_id = in_user_id;

  xp_earned := v_xp_earned;
  total_xp := v_total_xp;
  rank_name := v_rank_name;
  can_claim_again := (CURRENT_DATE + 1)::text;

  RETURN;
END;
$$;

-- Verify
SELECT proname, pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_rank', 'award_daily_login')
ORDER BY p.proname;

-- Force PostgREST to reload schema cache
notify pgrst, 'reload schema';