'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { HeuresSemaine } from '../../lib/parisTime';

/** `site_infos.heures_semaine` du site — alimente le calcul de ponctualité (B3). */
export function useSiteHeuresOuverture(siteId: number | undefined) {
  return useQuery({
    queryKey: ['site-infos-heures-semaine', siteId],
    enabled: typeof siteId === 'number' && siteId > 0,
    queryFn: async (): Promise<HeuresSemaine | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site_infos')
        .select('heures_semaine')
        .eq('site_id', siteId!)
        .maybeSingle();
      if (error) throw new Error(`useSiteHeuresOuverture failed: ${error.message}`);
      return (data?.heures_semaine ?? null) as HeuresSemaine | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
