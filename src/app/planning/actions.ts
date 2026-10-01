'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

export type ValidatePlanningWeekResult =
  | { ok: true; weekStart: string }
  | { ok: false; error: string };

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valide toutes les attributions de la semaine (RPC security definer). */
export async function validatePlanningWeek(
  weekStart: string,
): Promise<ValidatePlanningWeekResult> {
  if (!DATE_ISO_RE.test(weekStart)) {
    return { ok: false, error: 'Semaine invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await session.supabase.rpc('validate_planning_week', {
    p_week_start: weekStart,
  });

  if (error) {
    return { ok: false, error: `Validation échouée : ${error.message}` };
  }

  const payload = data as { ok?: boolean; reason?: string; week_start?: string } | null;
  if (!payload?.ok) {
    return {
      ok: false,
      error:
        payload?.reason === 'nothing_to_validate'
          ? 'Rien à valider pour cette semaine.'
          : 'Validation impossible.',
    };
  }

  return { ok: true, weekStart };
}
