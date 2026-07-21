'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

/**
 * Persiste les disponibilités hebdomadaires dans `public.availability`.
 * Upsert sur `(user_id, date)`. `user_id` dérivé de la session.
 */

export interface AvailabilityDayInput {
  /** Format ISO date YYYY-MM-DD */
  date: string;
  available: boolean;
  note: string | null;
}

export type SubmitAvailabilityResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function submitAvailability(
  days: AvailabilityDayInput[],
): Promise<SubmitAvailabilityResult> {
  if (!Array.isArray(days) || days.length === 0) {
    return { ok: false, error: 'Aucune disponibilité à envoyer.' };
  }
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      return { ok: false, error: `Date invalide : ${d.date}` };
    }
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const rows = days.map((d) => {
    const trimmedNote = d.note?.trim() ?? '';
    return {
      user_id: session.userId,
      date: d.date,
      available: d.available,
      note: !d.available && trimmedNote.length > 0 ? trimmedNote : null,
    };
  });

  const { error } = await session.supabase
    .from('availability')
    .upsert(rows, { onConflict: 'user_id,date' });

  if (error) {
    return { ok: false, error: `Enregistrement des disponibilités échoué : ${error.message}` };
  }

  return { ok: true, count: rows.length };
}
