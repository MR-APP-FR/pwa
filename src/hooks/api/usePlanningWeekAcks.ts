'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { createClient } from '../../lib/supabase/client';
import type { PlanningWeekAckRow } from '../../database/types/planning-week-ack.types';

export const pendingPlanningAcksKey = (employeeId: number | null | undefined) =>
  ['planning-week-acks-pending', employeeId] as const;

async function fetchPendingAcks(): Promise<PlanningWeekAckRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('planning_week_ack')
    .select(
      'week_start, user_id, status, assignment_fingerprint, notified_at, validated_at, created_at, updated_at',
    )
    .eq('status', 'pending')
    .order('week_start', { ascending: true });

  if (error) throw new Error(`acks planning: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...(row as PlanningWeekAckRow),
    week_start: String((row as PlanningWeekAckRow).week_start).slice(0, 10),
  }));
}

/** Acks pending de l’employé connecté (RLS own). */
export function usePendingPlanningAcks() {
  const { data: user } = useCurrentUser();
  const employeeId = user?.user.id ?? null;

  return useQuery({
    queryKey: pendingPlanningAcksKey(employeeId),
    queryFn: fetchPendingAcks,
    enabled: employeeId != null,
    staleTime: 30_000,
  });
}

export function usePendingAckForWeek(weekStartIso: string | null) {
  const { data, ...rest } = usePendingPlanningAcks();
  const ack =
    weekStartIso && data
      ? data.find((row) => row.week_start === weekStartIso) ?? null
      : null;
  return { ack, ...rest };
}

export function invalidatePendingPlanningAcks(
  queryClient: ReturnType<typeof useQueryClient>,
  employeeId: number | null | undefined,
) {
  void queryClient.invalidateQueries({ queryKey: pendingPlanningAcksKey(employeeId) });
}
