'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { OpeningAffaires, OpeningFormRow, OpeningPanneaux } from '../../database/types';
import type { DailyInfoRow } from '../../database/types/forms.types';

export type ExistingOpeningBundle = {
  opening: OpeningFormRow;
  dailyInfo: DailyInfoRow | null;
};

export function useExistingOpeningForm(siteId: number | undefined, dateIso: string | null) {
  return useQuery({
    queryKey: ['existingOpeningForm', siteId, dateIso],
    enabled: typeof siteId === 'number' && siteId > 0 && dateIso != null && /^\d{4}-\d{2}-\d{2}$/.test(dateIso),
    queryFn: async (): Promise<ExistingOpeningBundle | null> => {
      if (siteId == null || !dateIso) return null;
      const supabase = createClient();
      const [openRes, dailyRes] = await Promise.all([
        supabase
          .from('opening_form')
          .select(
            'id, site_id, user_id, date, feuilles_de_jour, tickets_ouverture, fond_caisse_100, observations, submitted_at, client_lat, client_lng, chrono_seconds, panneaux, affaires',
          )
          .eq('site_id', siteId)
          .eq('date', dateIso)
          .maybeSingle(),
        supabase
          .from('daily_info')
          .select(
            'id, site_id, user_id, date, nettoyage_veille, photo_nettoyage_url, photo_source, photo_captured_at, pannes, pannes_sujet_ids, pannes_autre, carte_parking, musique_disney, submitted_at',
          )
          .eq('site_id', siteId)
          .eq('date', dateIso)
          .maybeSingle(),
      ]);

      if (openRes.error) {
        throw new Error(`useExistingOpeningForm failed: ${openRes.error.message}`);
      }
      if (dailyRes.error) {
        throw new Error(`useExistingOpeningForm daily_info failed: ${dailyRes.error.message}`);
      }
      if (!openRes.data) return null;

      const opening = openRes.data as OpeningFormRow;
      if (opening.panneaux && typeof opening.panneaux === 'object') {
        opening.panneaux = opening.panneaux as OpeningPanneaux;
      }
      if (opening.affaires && typeof opening.affaires === 'object') {
        opening.affaires = opening.affaires as OpeningAffaires;
      }

      return {
        opening,
        dailyInfo: (dailyRes.data as DailyInfoRow | null) ?? null,
      };
    },
    staleTime: 30 * 1000,
  });
}
