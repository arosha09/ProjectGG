export interface Game {
  name: string;
  code: string;
  desc: string;
  imageUrl?: string;
  series_image_url?: string;
  total_count?: number;
  sequence_timeline?: number | null;
  sequence_release?: number | null;
  is_series?: boolean;
  series_name?: string | null;
  genres?: string[];
  cover_url?: string;
  external_id?: string;
  external_source?: string;
  rating?: number | null;
  release_year?: number | null;
  platforms?: string[];
  sources?: string[];
  tier?: string;
  collected_at?: string;
  xp_awarded?: number;
}
