'use client';

import { useQuery } from '@tanstack/react-query';
import { MOCK_SITES, MOCK_GROUPES } from '../../database/mock/sites.mock';
import { createClient } from '../../lib/supabase/client';
import type { Groupe, Site } from '../../database/types';
import { formatSiteName } from '../../lib/formatSiteName';

function withFormattedSiteNames(sites: Site[]): Site[] {
  return sites.map((site) => ({ ...site, name: formatSiteName(site.name) }));
}

const MOCK_DATA = { sites: withFormattedSiteNames(MOCK_SITES), groupes: MOCK_GROUPES };

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
    console.warn(`useSites site fetch failed: ${sitesRes.error.message}`);
    return MOCK_DATA;
  }

  const sites = withFormattedSiteNames((sitesRes.data ?? []) as Site[]);
  if (sites.length === 0) {
    return MOCK_DATA;
  }

  const groupes = groupesRes.error
    ? MOCK_GROUPES
    : ((groupesRes.data ?? []) as Groupe[]);

  return { sites, groupes };
}

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: fetchSites,
    initialData: MOCK_DATA,
    staleTime: 5 * 60 * 1000,
  });
}
