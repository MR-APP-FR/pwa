'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';

/** Lit `dispo_derniere_minute` du jour pour préremplir le toggle d'accueil (B4). */
export function useTodayAvailability(dateIso: string) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery({
    queryKey: ['today-dispo-derniere-minute', employeeId, dateIso],
    enabled: employeeId !== null && dateIso.length > 0,
    queryFn: async (): Promise<boolean> => {
      if (employeeId === null) return false;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('availability')
        .select('dispo_derniere_minute')
        .eq('user_id', employeeId)
        .eq('date', dateIso)
        .maybeSingle();
      if (error) throw new Error(`useTodayAvailability failed: ${error.message}`);
      return data?.dispo_derniere_minute ?? false;
    },
    staleTime: 30 * 1000,
  });
}
