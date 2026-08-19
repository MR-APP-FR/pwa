'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { HeuresSemaine } from '../../lib/parisTime';

/**
 * `site_infos.heures_semaine` pour plusieurs sites en un seul aller-retour —
 * variante multi-site de `useSiteHeuresOuverture`, pour les écrans qui
 * affichent une semaine avec un site différent chaque jour (planning).
 * Audit 2026-08-18 §4.2 : remplace les horaires en dur `SITE_TIME_RANGES_FULL`
 * (3 sites seulement).
 */
export function useSitesHeuresOuverture(siteIds: number[]) {
  const sortedIds = [...new Set(siteIds)].sort((a, b) => a - b);
  const key = sortedIds.join(',');

  return useQuery({
    queryKey: ['sites-infos-heures-semaine', key],
    enabled: sortedIds.length > 0,
    queryFn: async (): Promise<Map<number, HeuresSemaine>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site_infos')
        .select('site_id, heures_semaine')
        .in('site_id', sortedIds);
      if (error) throw new Error(`useSitesHeuresOuverture failed: ${error.message}`);
      const map = new Map<number, HeuresSemaine>();
      for (const row of data ?? []) {
        if (row.heures_semaine) map.set(row.site_id, row.heures_semaine as HeuresSemaine);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}
