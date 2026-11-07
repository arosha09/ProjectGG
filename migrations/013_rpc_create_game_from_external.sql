-- ProjectGG Game Sync - RPC Function: create_game_from_external
-- Run this in Supabase SQL editor (in the projectgg schema context)

create or replace function projectgg.create_game_from_external(
  in_name text,
  in_code text,
  in_desc text,
  in_cover_url text,
  in_genres text[],
  in_external_id text,
  in_rating numeric,
  in_sequence_release integer,
  in_is_series boolean,
  in_series_name text,
  in_platforms text[],
  in_sources text[]
)
returns jsonb
language plpgsql
as $$
declare
  v_game_id bigint;
  v_code text;
begin
  -- If code is provided, check if game already exists
  if in_code is not null then
    select id, code into v_game_id, v_code
    from projectgg.games_master
    where code = in_code;

    if v_game_id is not null then
      -- Update existing game
      update projectgg.games_master
      set
        name = coalesce(in_name, name),
        desc = coalesce(in_desc, desc),
        cover_url = coalesce(in_cover_url, cover_url),
        genres = coalesce(in_genres, genres),
        external_id = coalesce(in_external_id, external_id),
        rating = coalesce(in_rating, rating),
        sequence_release = coalesce(in_sequence_release, sequence_release),
        is_series = coalesce(in_is_series, is_series),
        series_name = coalesce(in_series_name, series_name),
        platforms = coalesce(in_platforms, platforms),
        sources = coalesce(in_sources, sources),
        last_synced_at = now()
      where id = v_game_id;

      return jsonb_build_object('ok', true, 'code', v_code, 'action', 'updated');
    end if;
  end if;

  -- Generate a code from name if not provided
  v_code := lower(regexp_replace(coalesce(in_name, 'unknown'), '[^a-z0-9]+', '-', 'g'));
  v_code := regexp_replace(v_code, '^-+|-+$', '', 'g');

  -- Insert new game
  insert into projectgg.games_master (
    code, name, desc, cover_url, genres, external_id, rating,
    sequence_release, is_series, series_name, platforms, sources,
    last_synced_at
  ) values (
    v_code, in_name, in_desc, in_cover_url, in_genres, in_external_id,
    in_rating, in_sequence_release, in_is_series, in_series_name,
    in_platforms, in_sources, now()
  )
  returning id into v_game_id;

  return jsonb_build_object('ok', true, 'code', v_code, 'action', 'created');
end;
$$;

grant execute on function projectgg.create_game_from_external(text, text, text, text, text[], text, numeric, integer, boolean, text, text[], text[]) to authenticated;
grant execute on function projectgg.create_game_from_external(text, text, text, text, text[], text, numeric, integer, boolean, text, text[], text[]) to anon;
