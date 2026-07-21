'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import type { Groupe, Site } from '../../database/types';
import { formatSiteName } from '../../lib/formatSiteName';

function withFormattedSiteNames(sites: Site[]): Site[] {
  return sites.map((site) => ({ ...site, name: formatSiteName(site.name) }));
}

async function fetchSites(): Promise<{ sites: Site[]; groupes: Groupe[] }> {
  const supabase = createClient();

  const [sitesRes, groupesRes] = await Promise.all([
    supabase
      .from('site')
      .select(
        'id, name, slug, adresse, cp_ville, metro, latitude, longitude, code_postal, ville, indication, statut, nb_teneur, group_id',
      )
      .order('name'),
    supabase.from('groupe').select('id, name').order('name'),
  ]);

  if (sitesRes.error) {
    throw new Error(`useSites site fetch failed: ${sitesRes.error.message}`);
  }
  if (groupesRes.error) {
    throw new Error(`useSites groupe fetch failed: ${groupesRes.error.message}`);
  }

  return {
    sites: withFormattedSiteNames((sitesRes.data ?? []) as Site[]),
    groupes: (groupesRes.data ?? []) as Groupe[],
  };
}

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: fetchSites,
    staleTime: 5 * 60 * 1000,
  });
}
