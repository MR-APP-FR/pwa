'use client';

import { useQuery } from '@tanstack/react-query';
import { listMaintenanceInterventions } from '../../app/interventions/actions';
import { useCurrentUser } from './useCurrentUser';
import { isMaintenanceRole } from '../../lib/staff-role';

export function useMaintenanceInterventions(enabled = true) {
  const { data: currentUser } = useCurrentUser();
  const isMaintenance = isMaintenanceRole(currentUser?.user.role);

  return useQuery({
    queryKey: ['maintenanceInterventions'],
    queryFn: async () => {
      const result = await listMaintenanceInterventions();
      if (!result.ok) throw new Error(result.error);
      return result.tickets;
    },
    enabled: enabled && isMaintenance,
    staleTime: 30_000,
  });
}
