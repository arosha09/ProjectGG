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
  v_new_broken text[];
begin
  -- Find the game by code
  select id into v_game_id
  from projectgg.games_master
  where code = in_code;

  if v_game_id is null then
    return jsonb_build_object('ok', false, 'error', 'game_not_found', 'code', in_code);
  end if;

  -- Update fields, only setting non-null values
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

  -- Compute broken_fields: fields that are still null after update
  select array_agg(col) into v_new_broken
  from (
    select col from (
      values
        ('cover_url', projectgg.games_master.cover_url),
        ('genres', projectgg.games_master.genres),
        ('external_id', projectgg.games_master.external_id),
        ('rating', projectgg.games_master.rating::text),
        ('sequence_release', projectgg.games_master.sequence_release::text),
        ('desc', projectgg.games_master.desc),
        ('platforms', projectgg.games_master.platforms),
        ('sources', projectgg.games_master.sources)
      ) as t(col, val)
    ) sub
    where val is null
  ) into v_new_broken;

  update projectgg.games_master
  set broken_fields = v_new_broken
  where id = v_game_id;

  -- Handle clearing broken fields (when a field was previously broken but now fixed)
  if in_clear_broken is not null then
    update projectgg.games_master
    set broken_fields = (
      select array_agg(elem) from unnest(coalesce(broken_fields, ARRAY[]::text[])) as elem
      where elem <> all(in_clear_broken)
    )
    where id = v_game_id;
  end if;

  return jsonb_build_object('ok', true, 'code', in_code);
end;
$$;

-- Grant execute permission
grant execute on function projectgg.update_game_external(text, text, text[], text, numeric, integer, text, text[], text[], timestamptz, text[]) to authenticated;
grant execute on function projectgg.update_game_external(text, text, text[], text, numeric, integer, text, text[], text[], timestamptz, text[]) to anon;
