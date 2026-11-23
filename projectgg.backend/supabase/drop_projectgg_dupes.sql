-- Drop old broken functions from projectgg schema
-- (they now live only in public schema with correct code)

DROP FUNCTION IF EXISTS projectgg.award_daily_login(uuid);
DROP FUNCTION IF EXISTS projectgg.get_user_rank(uuid);
DROP FUNCTION IF EXISTS projectgg.can_claim_daily(uuid);
DROP FUNCTION IF EXISTS projectgg.get_leaderboard(integer);

-- Verify only public versions remain
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('award_daily_login', 'get_user_rank', 'can_claim_daily', 'get_leaderboard')
ORDER BY n.nspname, p.proname;
