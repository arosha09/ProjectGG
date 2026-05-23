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
}
