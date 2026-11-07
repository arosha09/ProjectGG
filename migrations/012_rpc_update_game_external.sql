-- ProjectGG Game Sync - RPC Functions
-- Run this in Supabase SQL editor (in the projectgg schema context)

-- Function to update a game from external sync data
create or replace function projectgg.update_game_external(
  in_code text,
  in_cover_url text,
  in_genres text[],
  in_external_id text,
  in_rating numeric,
  in_sequence_release integer,
  in_desc text,
  in_platforms text[],
  in_sources text[],
  in_last_synced_at timestamptz,
  in_clear_broken text[]
)
returns jsonb
language plpgsql
as $$
declare
  v_game_id bigint;
  v_current_broken text[];
  v_new_broken text[];
  v_updates text;
begin
  -- Find the game by code
  select id into v_game_id
  from projectgg.games_master
  where code = in_code;

  if v_game_id is null then
    return jsonb_build_object('ok', false, 'error', 'game_not_found', 'code', in_code);
  end if;

  -- Build the update set clause, only updating non-null values
  -- All array params are text[], scalar params match column types
  update projectgg.games_master
  set
    cover_url = coalesce(in_cover_url, cover_url),
    genres = coalesce(in_genres, genres),
    external_id = coalesce(in_external_id, external_id),
    rating = coalesce(in_rating, rating),
    sequence_release = coalesce(in_sequence_release, sequence_release),
    desc = coalesce(in_desc, desc),
    platforms = coalesce(in_platforms, platforms),
    sources = coalesce(in_sources, sources),
    last_synced_at = in_last_synced_at
  where id = v_game_id;

  -- Handle clearing broken fields
  if in_clear_broken is not null then
    select broken_fields into v_current_broken
    from projectgg.games_master
    where id = v_game_id;

    -- Remove cleared items from broken_fields
    select array_agg(elem) into v_new_broken
    from unnest(coalesce(v_current_broken, ARRAY[]::text[])) as elem
    where elem <> all(in_clear_broken);

    update projectgg.games_master
    set broken_fields = case when v_new_broken is null then null else v_new_broken end
    where id = v_game_id;
  end if;

  return jsonb_build_object('ok', true, 'code', in_code);
end;
$$;

-- Grant execute permission
grant execute on function projectgg.update_game_external(text, text, text[], text, numeric, integer, text, text[], text[], timestamptz, text[]) to authenticated;
grant execute on function projectgg.update_game_external(text, text, text[], text, numeric, integer, text, text[], text[], timestamptz, text[]) to anon;
