'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { ClosingFormRow } from '../../database/types';

export type ExistingClosingForm = ClosingFormRow & {
  frais: string | null;
  frais_raison: string | null;
};

export function useExistingClosingForm(siteId: number | undefined, dateIso: string | null) {
  return useQuery({
    queryKey: ['existingClosingForm', siteId, dateIso],
    enabled: typeof siteId === 'number' && siteId > 0 && dateIso != null && /^\d{4}-\d{2}-\d{2}$/.test(dateIso),
    queryFn: async (): Promise<ExistingClosingForm | null> => {
      if (siteId == null || !dateIso) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('closing_form')
        .select('*')
        .eq('site_id', siteId)
        .eq('date', dateIso)
        .maybeSingle();

      if (error) {
        throw new Error(`useExistingClosingForm failed: ${error.message}`);
      }
      return (data as ExistingClosingForm | null) ?? null;
    },
    staleTime: 30 * 1000,
  });
}
