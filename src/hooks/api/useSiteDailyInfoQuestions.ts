'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

/**
 * GRE-57 — questions conditionnelles à afficher dans l'info-jour selon
 * la config du site (`site.daily_info_questions text[]`, cf. GRE-116).
 * Valeurs supportées dans la PWA V1 : 'carte_parking', 'musique_disney'.
 */

export type DailyInfoQuestionKey = 'carte_parking' | 'musique_disney';

const SUPPORTED_QUESTIONS: ReadonlySet<DailyInfoQuestionKey> = new Set([
  'carte_parking',
  'musique_disney',
]);

export function useSiteDailyInfoQuestions(siteId: number | undefined) {
  return useQuery({
    queryKey: ['site-daily-info-questions', siteId],
    enabled: typeof siteId === 'number' && siteId > 0,
    queryFn: async (): Promise<DailyInfoQuestionKey[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('site')
        .select('daily_info_questions')
        .eq('id', siteId!)
        .maybeSingle();
      if (error) {
        throw new Error(`useSiteDailyInfoQuestions failed: ${error.message}`);
      }
      const raw = (data?.daily_info_questions ?? []) as string[];
      return raw.filter((q): q is DailyInfoQuestionKey =>
        SUPPORTED_QUESTIONS.has(q as DailyInfoQuestionKey),
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}
