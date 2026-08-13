'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { SiteWeather } from '../../database/types';

export function useSiteWeather(siteId: number | null, dateIso: string | null) {
  return useQuery({
    queryKey: ['site-weather', siteId, dateIso],
    enabled: siteId != null && Boolean(dateIso),
    queryFn: async (): Promise<SiteWeather | null> => {
      if (siteId == null || !dateIso) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site_weather')
        .select(
          'id, site_id, date, condition, temp_min, temp_max, temp_mean, precipitation_mm, sunshine_hours, weather_code, source, fetched_at, is_weekend, is_holiday, holiday_name, is_bridge, is_school_holiday, crowd_level, crowd_enfants_avg, crowd_sample_count',
        )
        .eq('site_id', siteId)
        .eq('date', dateIso)
        .maybeSingle();
      if (error) throw new Error(`useSiteWeather failed: ${error.message}`);
      return (data as SiteWeather | null) ?? null;
    },
    staleTime: 30 * 60 * 1000,
  });
}
