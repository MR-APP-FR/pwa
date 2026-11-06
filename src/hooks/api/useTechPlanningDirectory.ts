'use client';

import { useQuery } from '@tanstack/react-query';
import { getTechPlanningDirectory } from '../../app/annuaire/actions';
import { useCurrentUser } from './useCurrentUser';
import { isMaintenanceRole } from '../../lib/staff-role';

export function useTechPlanningDirectory(fromIso: string, toIso: string, enabled = true) {
  const { data: currentUser } = useCurrentUser();
  const isMaintenance = isMaintenanceRole(currentUser?.user.role);

  return useQuery({
    queryKey: ['techPlanningDirectory', fromIso, toIso],
    queryFn: async () => {
      const result = await getTechPlanningDirectory(fromIso, toIso);
      if (!result.ok) throw new Error(result.error);
      return result.rows;
    },
    enabled: enabled && isMaintenance && Boolean(fromIso) && Boolean(toIso),
    staleTime: 60_000,
  });
}
