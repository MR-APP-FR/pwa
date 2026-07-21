'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';

/**
 * Indique si ouverture / fermeture déjà soumises pour une mission
 * (site + date + employé connecté).
 */

export interface MissionFormsStatus {
  hasOpening: boolean;
  hasClosing: boolean;
}

export function useMissionForms(siteId: number | undefined, dateIso: string | undefined) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery<MissionFormsStatus>({
    queryKey: ['missionForms', employeeId, siteId, dateIso],
    enabled: employeeId !== null && siteId != null && !!dateIso,
    queryFn: async () => {
      if (employeeId === null || siteId == null || !dateIso) {
        return { hasOpening: false, hasClosing: false };
      }
      const supabase = createClient();
      const [openRes, closeRes] = await Promise.all([
        supabase
          .from('opening_form')
          .select('id')
          .eq('site_id', siteId)
          .eq('date', dateIso)
          .eq('user_id', employeeId)
          .maybeSingle(),
        supabase
          .from('closing_form')
          .select('id')
          .eq('site_id', siteId)
          .eq('date', dateIso)
          .eq('user_id', employeeId)
          .maybeSingle(),
      ]);

      if (openRes.error) {
        throw new Error(`useMissionForms opening fetch failed: ${openRes.error.message}`);
      }
      if (closeRes.error) {
        throw new Error(`useMissionForms closing fetch failed: ${closeRes.error.message}`);
      }

      return { hasOpening: openRes.data != null, hasClosing: closeRes.data != null };
    },
    staleTime: 0,
  });
}
