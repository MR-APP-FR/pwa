'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

/** Items possibles de `site.closing_checklist_items` (cf. migration Phase 0). */
export const CLOSING_CHECKLIST_ITEMS = [
  'nettoyage',
  'feuille_jour',
  'tickets',
  'panneaux',
  'rouleau_cb',
  'carte_parking',
] as const;

export type ClosingChecklistItemKey = (typeof CLOSING_CHECKLIST_ITEMS)[number];

const SUPPORTED_ITEMS: ReadonlySet<string> = new Set(CLOSING_CHECKLIST_ITEMS);

export function useSiteClosingChecklist(siteId: number | undefined) {
  return useQuery({
    queryKey: ['site-closing-checklist', siteId],
    enabled: typeof siteId === 'number' && siteId > 0,
    queryFn: async (): Promise<ClosingChecklistItemKey[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site')
        .select('closing_checklist_items')
        .eq('id', siteId!)
        .maybeSingle();
      if (error) throw new Error(`useSiteClosingChecklist failed: ${error.message}`);
      const raw = (data?.closing_checklist_items ?? []) as string[];
      return raw.filter((item): item is ClosingChecklistItemKey => SUPPORTED_ITEMS.has(item));
    },
    staleTime: 5 * 60 * 1000,
  });
}
