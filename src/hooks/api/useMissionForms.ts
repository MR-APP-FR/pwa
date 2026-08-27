'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';

/**
 * Indique si ouverture / fermeture déjà soumises pour une mission
 * (une ligne par site + date, modèle site-jour).
 * `openingLat` / `openingLng` = GPS capté à l'ouverture, ancre des 200 m.
 */

export interface MissionFormsStatus {
  hasOpening: boolean;
  hasClosing: boolean;
  openingLat: number | null;
  openingLng: number | null;
}

export function useMissionForms(siteId: number | undefined, dateIso: string | undefined) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery<MissionFormsStatus>({
    queryKey: ['missionForms', employeeId, siteId, dateIso],
    enabled: employeeId !== null && siteId != null && !!dateIso,
    queryFn: async () => {
      if (employeeId === null || siteId == null || !dateIso) {
        return { hasOpening: false, hasClosing: false, openingLat: null, openingLng: null };
      }
      const supabase = createClient();
      const [openRes, closeRes] = await Promise.all([
        supabase
          .from('opening_form')
          .select('id, client_lat, client_lng')
          .eq('site_id', siteId)
          .eq('date', dateIso)
          .maybeSingle(),
        supabase
          .from('closing_form')
          .select('id')
          .eq('site_id', siteId)
          .eq('date', dateIso)
          .maybeSingle(),
      ]);

      if (openRes.error) {
        throw new Error(`useMissionForms opening fetch failed: ${openRes.error.message}`);
      }
      if (closeRes.error) {
        throw new Error(`useMissionForms closing fetch failed: ${closeRes.error.message}`);
      }

      const openingLat =
        typeof openRes.data?.client_lat === 'number' && Number.isFinite(openRes.data.client_lat)
          ? openRes.data.client_lat
          : null;
      const openingLng =
        typeof openRes.data?.client_lng === 'number' && Number.isFinite(openRes.data.client_lng)
          ? openRes.data.client_lng
          : null;

      return {
        hasOpening: openRes.data != null,
        hasClosing: closeRes.data != null,
        openingLat,
        openingLng,
      };
    },
    staleTime: 0,
  });
}
