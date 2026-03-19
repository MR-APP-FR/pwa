'use client';

import { useQuery } from '@tanstack/react-query';
import { MOCK_PLANNING } from '../../database/mock/planning.mock';

interface UsePlanningParams {
  year: number;
  month: number;
}

const MOCK_DATA = { planning: MOCK_PLANNING };

export function usePlanning(params: UsePlanningParams) {
  return useQuery({
    queryKey: ['planning', params.year, params.month],
    queryFn: async () => MOCK_DATA,
    initialData: MOCK_DATA,
  });
}
