-- Add sources array and rename platform → platforms
ALTER TABLE projectgg.games_master ADD COLUMN IF NOT EXISTS sources TEXT[] DEFAULT '{}';
ALTER TABLE projectgg.games_master DROP COLUMN IF EXISTS platform;
ALTER TABLE projectgg.games_master ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT '{}';

-- For existing external_source migration
UPDATE projectgg.games_master SET sources = ARRAY[external_source] WHERE external_source IS NOT NULL AND sources = '{}';

-- Drop the old single-column
ALTER TABLE projectgg.games_master DROP COLUMN IF EXISTS external_source;

-- Update generate_game_code (no platform suffix — single row per game)
CREATE OR REPLACE FUNCTION public.generate_game_code(name TEXT) RETURNS TEXT AS $$
DECLARE
  base_code TEXT;
BEGIN
  base_code := LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_code := TRIM(BOTH '-' FROM base_code);
  RETURN base_code;
END;
$$ LANGUAGE plpgsql;

-- Create/update game from external — merge platforms AND sources on conflict
CREATE OR REPLACE FUNCTION public.create_game_from_external(
  in_name TEXT,
  in_code TEXT DEFAULT NULL,
  in_desc TEXT DEFAULT NULL,
  in_cover_url TEXT DEFAULT NULL,
  in_genres TEXT[] DEFAULT NULL,
  in_external_id TEXT DEFAULT NULL,
  in_external_source TEXT DEFAULT NULL,
  in_rating REAL DEFAULT NULL,
  in_release_year INTEGER DEFAULT NULL,
  in_is_series BOOLEAN DEFAULT FALSE,
  in_series_name TEXT DEFAULT NULL,
  in_platforms TEXT[] DEFAULT '{}',
  in_sources TEXT[] DEFAULT '{}'
) RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF in_code IS NOT NULL THEN
    new_code := in_code;
  ELSE
    new_code := public.generate_game_code(in_name);
  END IF;

  INSERT INTO projectgg.games_master (name, code, desc, cover_url, genres, external_id, external_source, rating, release_year, is_series, series_name, platforms, sources)
  VALUES (in_name, new_code, in_desc, in_cover_url, in_genres, in_external_id, in_external_source, in_rating, in_release_year, in_is_series, in_series_name, in_platforms, in_sources)
  ON CONFLICT (code) DO UPDATE SET
    platforms = ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(projectgg.games_master.platforms, '{}') || COALESCE(in_platforms, '{}')
      )
    ),
    sources = ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(projectgg.games_master.sources, '{}') || COALESCE(in_sources, '{}')
      )
    ),
    cover_url = COALESCE(in_cover_url, projectgg.games_master.cover_url),
    genres = COALESCE(in_genres, projectgg.games_master.genres),
    external_id = COALESCE(in_external_id, projectgg.games_master.external_id),
    external_source = CASE
      WHEN projectgg.games_master.external_source IS NULL THEN in_external_source
      WHEN in_external_source IS NULL THEN projectgg.games_master.external_source
      ELSE projectgg.games_master.external_source
    END,
    rating = COALESCE(in_rating, projectgg.games_master.rating),
    release_year = LEAST(
      COALESCE(in_release_year, projectgg.games_master.release_year),
      COALESCE(projectgg.games_master.release_year, in_release_year)
    ),
    desc = COALESCE(in_desc, projectgg.games_master.desc);

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Update sync function — merge platforms AND sources
CREATE OR REPLACE FUNCTION public.update_game_external(
  in_code TEXT,
  in_cover_url TEXT DEFAULT NULL,
  in_genres TEXT[] DEFAULT NULL,
  in_external_id TEXT DEFAULT NULL,
  in_external_source TEXT DEFAULT NULL,
  in_rating REAL DEFAULT NULL,
  in_release_year INTEGER DEFAULT NULL,
  in_desc TEXT DEFAULT NULL,
  in_platforms TEXT[] DEFAULT NULL,
  in_sources TEXT[] DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE projectgg.games_master
  SET
    cover_url = COALESCE(in_cover_url, cover_url),
    genres = COALESCE(in_genres, genres),
    external_id = COALESCE(in_external_id, external_id),
    external_source = COALESCE(in_external_source, external_source),
    rating = COALESCE(in_rating, rating),
    release_year = COALESCE(in_release_year, release_year),
    desc = COALESCE(in_desc, desc),
    platforms = CASE
      WHEN in_platforms IS NOT NULL AND array_length(in_platforms, 1) > 0
      THEN ARRAY(SELECT DISTINCT unnest(COALESCE(platforms, '{}') || in_platforms))
      ELSE platforms
    END,
    sources = CASE
      WHEN in_sources IS NOT NULL AND array_length(in_sources, 1) > 0
      THEN ARRAY(SELECT DISTINCT unnest(COALESCE(sources, '{}') || in_sources))
      ELSE sources
    END
  WHERE code = in_code;
END;
$$ LANGUAGE plpgsql;

-- All query functions return platforms + sources
CREATE OR REPLACE FUNCTION public.get_all_games(
  page_size INTEGER DEFAULT 12,
  page_number INTEGER DEFAULT 1
) RETURNS TABLE(
  name TEXT,
  code TEXT,
  desc TEXT,
  total_count BIGINT,
  sequence_timeline INTEGER,
  sequence_release INTEGER,
  is_series BOOLEAN,
  series_name TEXT,
  genres TEXT[],
  cover_url TEXT,
  external_id TEXT,
  external_source TEXT,
  rating REAL,
  release_year INTEGER,
  platforms TEXT[],
  sources TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gm.name, gm.code, gm.desc,
    COUNT(*) OVER()::BIGINT AS total_count,
    NULL::INTEGER, NULL::INTEGER,
    gm.is_series, gm.series_name,
    gm.genres, gm.cover_url,
    gm.external_id, gm.external_source,
    gm.rating, gm.release_year,
    gm.platforms, gm.sources
  FROM projectgg.games_master gm
  ORDER BY gm.name
  LIMIT page_size OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_games(
  in_user_id UUID,
  page_number INTEGER DEFAULT 1,
  page_size INTEGER DEFAULT 12
) RETURNS TABLE(
  name TEXT,
  code TEXT,
  desc TEXT,
  total_count BIGINT,
  sequence_timeline INTEGER,
  sequence_release INTEGER,
  is_series BOOLEAN,
  series_name TEXT,
  genres TEXT[],
  cover_url TEXT,
  external_id TEXT,
  external_source TEXT,
  rating REAL,
  release_year INTEGER,
  platforms TEXT[],
  sources TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gm.name, gm.code, gm.desc,
    COUNT(*) OVER()::BIGINT AS total_count,
    NULL::INTEGER, NULL::INTEGER,
    gm.is_series, gm.series_name,
    gm.genres, gm.cover_url,
    gm.external_id, gm.external_source,
    gm.rating, gm.release_year,
    gm.platforms, gm.sources
  FROM projectgg.games_master gm
  INNER JOIN projectgg.user_games ug ON ug.game_code = gm.code
  WHERE ug.user_id = in_user_id
  ORDER BY gm.name
  LIMIT page_size OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.search_games(
  search_query TEXT,
  page_size INTEGER DEFAULT 12,
  page_number INTEGER DEFAULT 1
) RETURNS TABLE(
  name TEXT,
  code TEXT,
  desc TEXT,
  total_count BIGINT,
  sequence_timeline INTEGER,
  sequence_release INTEGER,
  is_series BOOLEAN,
  series_name TEXT,
  genres TEXT[],
  cover_url TEXT,
  external_id TEXT,
  external_source TEXT,
  rating REAL,
  release_year INTEGER,
  platforms TEXT[],
  sources TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gm.name, gm.code, gm.desc,
    COUNT(*) OVER()::BIGINT AS total_count,
    NULL::INTEGER, NULL::INTEGER,
    gm.is_series, gm.series_name,
    gm.genres, gm.cover_url,
    gm.external_id, gm.external_source,
    gm.rating, gm.release_year,
    gm.platforms, gm.sources
  FROM projectgg.games_master gm
  WHERE gm.name ILIKE '%' || search_query || '%'
  ORDER BY gm.name
  LIMIT page_size OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;
