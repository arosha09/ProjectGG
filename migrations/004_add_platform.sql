-- Add platform column to games_master
ALTER TABLE projectgg.games_master ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'pc';

-- Update generate_game_code to accept optional platform
CREATE OR REPLACE FUNCTION public.generate_game_code(
  name TEXT,
  platform TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  base_code TEXT;
BEGIN
  base_code := LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_code := TRIM(BOTH '-' FROM base_code);

  IF platform IS NOT NULL AND platform != '' AND platform != 'pc' THEN
    RETURN base_code || '-' || platform;
  END IF;

  RETURN base_code;
END;
$$ LANGUAGE plpgsql;

-- Update create_game_from_external to accept platform
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
  in_platform TEXT DEFAULT 'pc'
) RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF in_code IS NOT NULL THEN
    new_code := in_code;
  ELSE
    new_code := public.generate_game_code(in_name, in_platform);
  END IF;

  INSERT INTO projectgg.games_master (name, code, desc, cover_url, genres, external_id, external_source, rating, release_year, is_series, series_name, platform)
  VALUES (in_name, new_code, in_desc, in_cover_url, in_genres, in_external_id, in_external_source, in_rating, in_release_year, in_is_series, in_series_name, in_platform)
  ON CONFLICT (code) DO NOTHING;

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Update update_game_external to accept platform
CREATE OR REPLACE FUNCTION public.update_game_external(
  in_code TEXT,
  in_cover_url TEXT DEFAULT NULL,
  in_genres TEXT[] DEFAULT NULL,
  in_external_id TEXT DEFAULT NULL,
  in_external_source TEXT DEFAULT NULL,
  in_rating REAL DEFAULT NULL,
  in_release_year INTEGER DEFAULT NULL,
  in_desc TEXT DEFAULT NULL,
  in_platform TEXT DEFAULT NULL
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
    platform = COALESCE(in_platform, platform)
  WHERE code = in_code;
END;
$$ LANGUAGE plpgsql;

-- Update get_all_games to return platform
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
  platform TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gm.name,
    gm.code,
    gm.desc,
    COUNT(*) OVER()::BIGINT AS total_count,
    NULL::INTEGER AS sequence_timeline,
    NULL::INTEGER AS sequence_release,
    gm.is_series,
    gm.series_name,
    gm.genres,
    gm.cover_url,
    gm.external_id,
    gm.external_source,
    gm.rating,
    gm.release_year,
    gm.platform
  FROM projectgg.games_master gm
  ORDER BY gm.name
  LIMIT page_size
  OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

-- Update get_user_games to return platform
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
  platform TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gm.name,
    gm.code,
    gm.desc,
    COUNT(*) OVER()::BIGINT AS total_count,
    NULL::INTEGER AS sequence_timeline,
    NULL::INTEGER AS sequence_release,
    gm.is_series,
    gm.series_name,
    gm.genres,
    gm.cover_url,
    gm.external_id,
    gm.external_source,
    gm.rating,
    gm.release_year,
    gm.platform
  FROM projectgg.games_master gm
  INNER JOIN projectgg.user_games ug ON ug.game_code = gm.code
  WHERE ug.user_id = in_user_id
  ORDER BY gm.name
  LIMIT page_size
  OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

-- Update search_games to return platform
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
  platform TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gm.name,
    gm.code,
    gm.desc,
    COUNT(*) OVER()::BIGINT AS total_count,
    NULL::INTEGER AS sequence_timeline,
    NULL::INTEGER AS sequence_release,
    gm.is_series,
    gm.series_name,
    gm.genres,
    gm.cover_url,
    gm.external_id,
    gm.external_source,
    gm.rating,
    gm.release_year,
    gm.platform
  FROM projectgg.games_master gm
  WHERE gm.name ILIKE '%' || search_query || '%'
  ORDER BY gm.name
  LIMIT page_size
  OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;
