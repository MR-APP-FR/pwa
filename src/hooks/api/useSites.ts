'use client';

import { useQuery } from '@tanstack/react-query';
import { MOCK_SITES, MOCK_GROUPES } from '../../database/mock/sites.mock';

const MOCK_DATA = { sites: MOCK_SITES, groupes: MOCK_GROUPES };

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: async () => MOCK_DATA,
    initialData: MOCK_DATA,
  });
}
