'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

export const DEFAULT_FOND_CAISSE_EUROS = 100;

export interface SiteTerrainConfig {
  fondCaisseEuros: number;
  standConfiserie: boolean;
  carteParkingEnabled: boolean;
  questionParkingLabel: string | null;
}

/** Options terrain du site (`site_infos`) : fond caisse, confiserie, parking. */
export function useSiteTerrainConfig(siteId: number | undefined) {
  return useQuery({
    queryKey: ['site-terrain-config', siteId],
    enabled: typeof siteId === 'number' && siteId > 0,
    queryFn: async (): Promise<SiteTerrainConfig> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site_infos')
        .select('fond_caisse, stand_confiserie, carte_parking, question_parking')
        .eq('site_id', siteId!)
        .maybeSingle();
      if (error) throw new Error(`useSiteTerrainConfig failed: ${error.message}`);

      const rawFond = data?.fond_caisse;
      const fondNum =
        typeof rawFond === 'number'
          ? rawFond
          : rawFond != null && rawFond !== ''
            ? Number(rawFond)
            : NaN;
      const fondCaisseEuros =
        Number.isFinite(fondNum) && fondNum > 0 ? Math.round(fondNum) : DEFAULT_FOND_CAISSE_EUROS;

      const questionParking =
        typeof data?.question_parking === 'string' && data.question_parking.trim().length > 0
          ? data.question_parking.trim()
          : null;

      return {
        fondCaisseEuros,
        standConfiserie: data?.stand_confiserie === true,
        carteParkingEnabled: data?.carte_parking === true,
        questionParkingLabel: questionParking,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
