'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';

/**
 * Lit les disponibilités déjà saisies par l'employé connecté sur une plage
 * de dates, pour préremplir /availability.
 */

/** Projection partielle (date, available, note) — pas le type table complet, cf. `database/types/AvailabilityRow`. */
export interface AvailabilitySummaryRow {
  date: string;
  available: boolean;
  note: string | null;
}

export function useAvailability(startIso: string, endIso: string) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery<AvailabilitySummaryRow[]>({
    queryKey: ['availability', employeeId, startIso, endIso],
    enabled: employeeId !== null && startIso.length > 0 && endIso.length > 0,
    queryFn: async () => {
      if (employeeId === null) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('availability')
        .select('date, available, note')
        .eq('user_id', employeeId)
        .gte('date', startIso)
        .lte('date', endIso);

      if (error) {
        throw new Error(`useAvailability fetch failed: ${error.message}`);
      }
      return (data ?? []) as AvailabilitySummaryRow[];
    },
    staleTime: 60 * 1000,
  });
}
