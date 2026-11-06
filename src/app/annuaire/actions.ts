'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';
import { isMaintenanceRole } from '../../lib/staff-role';
import type { TechPlanningDirectoryRow } from '../../database/types';

async function requireMaintenanceSession() {
  const session = await requireEmployeeSession();
  if (!session.ok) return session;

  const { data: userRow, error } = await session.supabase
    .from('user')
    .select('id, role')
    .eq('id', session.userId)
    .maybeSingle();

  if (error || !userRow) {
    return { ok: false as const, error: 'Impossible de vérifier le rôle.' };
  }
  if (!isMaintenanceRole(userRow.role)) {
    return { ok: false as const, error: 'Accès réservé à la maintenance.' };
  }

  return session;
}

function normalizeDay(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

/** Annuaire planning lecture (RPC) — tech only. */
export async function getTechPlanningDirectory(
  fromIso: string,
  toIso: string,
): Promise<{ ok: true; rows: TechPlanningDirectoryRow[] } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return { ok: false, error: session.error };

  const { data, error } = await session.supabase.rpc('get_tech_planning_directory', {
    p_from: fromIso,
    p_to: toIso,
  });

  if (error) {
    return { ok: false, error: error.message || 'Impossible de charger le planning.' };
  }

  const rows: TechPlanningDirectoryRow[] = ((data as Record<string, unknown>[] | null) ?? []).map(
    (r) => ({
      day: normalizeDay(r.day),
      site_id: Number(r.site_id),
      site_name: String(r.site_name ?? ''),
      group_id: r.group_id == null ? null : Number(r.group_id),
      group_name: String(r.group_name ?? 'Sans zone'),
      closed: Boolean(r.closed),
      staff_role:
        r.staff_role === 'teneur' || r.staff_role === 'double'
          ? r.staff_role
          : null,
      user_id: r.user_id == null ? null : Number(r.user_id),
      display_name: r.display_name == null ? null : String(r.display_name),
      telephone: r.telephone == null ? null : String(r.telephone),
      couleur: r.couleur == null ? null : String(r.couleur),
    }),
  );

  return { ok: true, rows };
}
