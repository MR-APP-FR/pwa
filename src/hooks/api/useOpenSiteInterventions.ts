'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { OpenSiteIntervention } from '../../database/types/intervention.types';

export function useOpenSiteInterventions(siteId: number | undefined, dateIso: string | null) {
  return useQuery({
    queryKey: ['openSiteInterventions', siteId, dateIso],
    enabled: typeof siteId === 'number' && siteId > 0 && dateIso != null && /^\d{4}-\d{2}-\d{2}$/.test(dateIso),
    queryFn: async (): Promise<OpenSiteIntervention[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('list_open_site_interventions', {
        p_site_id: siteId,
        p_date: dateIso,
      });
      if (error) {
        throw new Error(`useOpenSiteInterventions failed: ${error.message}`);
      }
      return (data ?? []) as OpenSiteIntervention[];
    },
    staleTime: 60 * 1000,
  });
}
