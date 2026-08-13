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

/**
 * Bascule la dispo « dernière minute » du jour même (B4).
 * Distincte de la saisie hebdomadaire (qui vise toujours la semaine N+1) :
 * upsert ciblé sur `(user_id, date)`, ne touche pas `note`.
 */
export async function submitDispoDerniereMinute(
  date: string,
  value: boolean,
): Promise<SubmitAvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: `Date invalide : ${date}` };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await session.supabase.from('availability').upsert(
    {
      user_id: session.userId,
      date,
      available: true,
      dispo_derniere_minute: value,
      dispo_derniere_minute_at: value ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,date' },
  );

  if (error) {
    return { ok: false, error: `Enregistrement de la dispo dernière minute échoué : ${error.message}` };
  }

  return { ok: true, count: 1 };
}
