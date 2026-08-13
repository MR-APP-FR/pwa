export type WeatherCondition = 'rain' | 'normal' | 'sun' | 'snow';
export type WeatherSource = 'forecast' | 'archive';
export type CrowdLevel = 'busy' | 'quiet' | 'typical';

export interface SiteWeather {
  id: number;
  site_id: number;
  date: string;
  condition: WeatherCondition;
  temp_min: number | null;
  temp_max: number | null;
  temp_mean: number | null;
  precipitation_mm: number | null;
  sunshine_hours: number | null;
  weather_code: number | null;
  source: WeatherSource;
  fetched_at: string;
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name: string | null;
  is_bridge: boolean;
  is_school_holiday: boolean;
  crowd_level: CrowdLevel;
  crowd_enfants_avg: number | null;
  crowd_sample_count: number | null;
}
