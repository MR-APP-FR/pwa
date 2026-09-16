'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

const BUCKET = 'telecollecte-photos';
const TTL_SEC = 60 * 60;

/** URL signée bucket privé `telecollecte-photos` (lecture employé authentifié). */
export function useTelecollecteSignedUrl(path: string | null | undefined) {
  const trimmed = path?.trim() || null;

  return useQuery({
    queryKey: ['telecollecteSignedUrl', trimmed],
    enabled: trimmed != null && trimmed.length > 0,
    queryFn: async (): Promise<string | null> => {
      if (!trimmed) return null;
      const supabase = createClient();
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(trimmed, TTL_SEC);
      if (error) {
        throw new Error(`Signed URL failed: ${error.message}`);
      }
      return data.signedUrl ?? null;
    },
    staleTime: 45 * 60 * 1000,
  });
}
