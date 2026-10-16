'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { dayHourKey, type DayHourOverride } from '../../lib/siteDayHours';

/**
 * Exceptions d'horaire (`site_day_hours`) pour des manèges et des jours précis.
 * Vide = horaire habituel de `site_infos`.
 */
export function useSiteDayHours(siteIds: number[], days: string[]) {
  const ids = [...new Set(siteIds.filter((id) => id > 0))].sort((a, b) => a - b);
  const dayList = [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();

  return useQuery({
    queryKey: ['site-day-hours', ids.join(','), dayList.join(',')],
    enabled: ids.length > 0 && dayList.length > 0,
    queryFn: async (): Promise<Map<string, DayHourOverride>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site_day_hours')
        .select('site_id, day, ouvre, ferme')
        .in('site_id', ids)
        .in('day', dayList);
      if (error) throw new Error(`useSiteDayHours failed: ${error.message}`);
      const map = new Map<string, DayHourOverride>();
      for (const row of data ?? []) {
        map.set(dayHourKey(Number(row.site_id), String(row.day)), {
          ouvre: row.ouvre == null ? null : String(row.ouvre),
          ferme: row.ferme == null ? null : String(row.ferme),
        });
      }
      return map;
    },
    staleTime: 60 * 1000,
  });
}
