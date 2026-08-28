'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

export interface SiteCarteParkingConfig {
  enabled: boolean;
  questionLabel: string | null;
}

/** `site_infos.carte_parking` + libellé optionnel — gate la question à l'ouverture. */
export function useSiteCarteParking(siteId: number | undefined) {
  return useQuery({
    queryKey: ['site-carte-parking', siteId],
    enabled: typeof siteId === 'number' && siteId > 0,
    queryFn: async (): Promise<SiteCarteParkingConfig> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site_infos')
        .select('carte_parking, question_parking')
        .eq('site_id', siteId!)
        .maybeSingle();
      if (error) throw new Error(`useSiteCarteParking failed: ${error.message}`);
      const questionParking =
        typeof data?.question_parking === 'string' && data.question_parking.trim().length > 0
          ? data.question_parking.trim()
          : null;
      return {
        enabled: data?.carte_parking === true,
        questionLabel: questionParking,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
