'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { Sujet } from '../../database/types/sujet.types';

/**
 * GRE-57 — sujets (manèges) actifs d'un site, alignés sur le CRM.
 * Lit `public.sujets` filtré par `site_id` et `state = true`.
 */

export type { Sujet };

export function useSujets(siteId: number | undefined) {
  return useQuery({
    queryKey: ['sujets', siteId],
    enabled: typeof siteId === 'number' && siteId > 0,
    queryFn: async (): Promise<Sujet[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sujets')
        .select('id, site_id, name, state')
        .eq('site_id', siteId!)
        .eq('state', true)
        .order('name', { ascending: true });
      if (error) {
        throw new Error(`useSujets failed: ${error.message}`);
      }
      return (data ?? []) as Sujet[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
