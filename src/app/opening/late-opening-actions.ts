'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

export type ReportLateOpeningResult = { ok: true } | { ok: false; error: string };

export async function reportLateOpeningToBureau(
  siteId: number,
  dateIso: string,
  reason: string,
  ouvreLabel: string | null,
): Promise<ReportLateOpeningResult> {
  const trimmed = reason.trim();
  if (!Number.isFinite(siteId) || siteId <= 0) return { ok: false, error: 'Site invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, error: 'Date invalide.' };
  if (trimmed.length === 0) return { ok: false, error: 'Le message ne peut pas être vide.' };
  if (trimmed.length > 500) return { ok: false, error: 'Raison trop longue (500 caractères max).' };

  const session = await requireEmployeeSession();
  if (!session.ok) return { ok: false, error: session.error };

  const { error } = await session.supabase.rpc('report_late_opening_to_bureau', {
    p_site_id: siteId,
    p_date: dateIso,
    p_reason: trimmed,
    p_ouvre_label: ouvreLabel,
  });
  if (error) {
    return { ok: false, error: `Envoi échoué : ${error.message}` };
  }
  return { ok: true };
}
