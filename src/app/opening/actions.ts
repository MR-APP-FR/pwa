'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

/**
 * Submit du formulaire d'ouverture → `public.opening_form`.
 * `user_id` dérivé de la session (`current_employee_id()`), jamais du client.
 */

export type SubmitOpeningResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

interface SubmitOpeningInput {
  siteId: number;
  /** Format ISO date YYYY-MM-DD — date de la mission */
  date: string;
  /** Texte libre validé côté UI (X ou X/Y) — cf. GRE-107 */
  feuillesDeJour: string;
  ticketsOuverture: number;
  fondCaisse100: boolean;
  observations: string | null;
}

function parseInput(formData: FormData): SubmitOpeningInput | { error: string } {
  const siteId = Number(formData.get('siteId'));
  const date = String(formData.get('date') ?? '');
  const feuillesDeJour = String(formData.get('feuillesDeJour') ?? '').trim();
  const ticketsOuvertureRaw = formData.get('ticketsOuverture');
  const ticketsOuverture = Number(ticketsOuvertureRaw);
  const fondCaisse100 = formData.get('fondCaisse100') === '1';
  const observationsRaw = String(formData.get('observations') ?? '').trim();
  const observations = observationsRaw.length === 0 ? null : observationsRaw;

  if (!Number.isFinite(siteId) || siteId <= 0) return { error: 'Site invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date invalide.' };
  if (feuillesDeJour.length === 0) return { error: 'Feuilles de jour manquantes.' };
  if (ticketsOuvertureRaw === null || !Number.isFinite(ticketsOuverture)) {
    return { error: "Nombre de tickets d'ouverture manquant" };
  }

  return { siteId, date, feuillesDeJour, ticketsOuverture, fondCaisse100, observations };
}

export async function submitOpeningForm(formData: FormData): Promise<SubmitOpeningResult> {
  const parsed = parseInput(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  // Upsert idempotent : une seule ligne par (site, jour, employé) — cf. étape 3
  const { data, error } = await session.supabase
    .from('opening_form')
    .upsert(
      {
        site_id: parsed.siteId,
        user_id: session.userId,
        date: parsed.date,
        feuilles_de_jour: parsed.feuillesDeJour,
        tickets_ouverture: parsed.ticketsOuverture,
        fond_caisse_100: parsed.fondCaisse100,
        observations: parsed.observations,
      },
      { onConflict: 'site_id,date,user_id' },
    )
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Enregistrement opening_form a échoué : ${error.message}` };
  }

  return { ok: true, id: data.id };
}
