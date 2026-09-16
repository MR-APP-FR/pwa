'use client';

import { useSiteTerrainConfig } from './useSiteTerrainConfig';

export interface SiteCarteParkingConfig {
  enabled: boolean;
  questionLabel: string | null;
}

/** @deprecated Prefer `useSiteTerrainConfig`. */
export function useSiteCarteParking(siteId: number | undefined) {
  const q = useSiteTerrainConfig(siteId);
  return {
    ...q,
    data: q.data
      ? {
          enabled: q.data.carteParkingEnabled,
          questionLabel: q.data.questionParkingLabel,
        }
      : undefined,
  };
}
