'use server';

import { createClient } from '../../lib/supabase/server';

/**
 * GRE-55 — server action de submit du formulaire d'ouverture.
 * Insère une ligne dans `public.opening_form` (cf. GRE-112).
 *
 * Mode démo : le client passe `userId` (employé sélectionné via le profile
 * switcher GRE-87). Quand l'auth réelle (GRE-54) sera livrée, le `user_id`
 * sera dérivé de la session via `current_employee_id()` côté SQL/RLS.
 */

export type SubmitOpeningResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

interface SubmitOpeningInput {
  siteId: number;
  userId: number;
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
  const userId = Number(formData.get('userId'));
  const date = String(formData.get('date') ?? '');
  const feuillesDeJour = String(formData.get('feuillesDeJour') ?? '').trim();
  const ticketsOuvertureRaw = formData.get('ticketsOuverture');
  const ticketsOuverture = Number(ticketsOuvertureRaw);
  const fondCaisse100 = formData.get('fondCaisse100') === '1';
  const observationsRaw = String(formData.get('observations') ?? '').trim();
  const observations = observationsRaw.length === 0 ? null : observationsRaw;

  if (!Number.isFinite(siteId) || siteId <= 0) return { error: 'Site invalide.' };
  if (!Number.isFinite(userId) || userId <= 0) return { error: 'Utilisateur invalide.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date invalide.' };
  if (feuillesDeJour.length === 0) return { error: 'Feuilles de jour manquantes.' };
  if (ticketsOuvertureRaw === null || !Number.isFinite(ticketsOuverture)) {
    return { error: "Nombre de tickets d'ouverture manquant" };
  }

  return { siteId, userId, date, feuillesDeJour, ticketsOuverture, fondCaisse100, observations };
}

export async function submitOpeningForm(formData: FormData): Promise<SubmitOpeningResult> {
  const parsed = parseInput(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opening_form')
    .insert({
      site_id: parsed.siteId,
      user_id: parsed.userId,
      date: parsed.date,
      feuilles_de_jour: parsed.feuillesDeJour,
      tickets_ouverture: parsed.ticketsOuverture,
      fond_caisse_100: parsed.fondCaisse100,
      observations: parsed.observations,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Insert opening_form a échoué : ${error.message}` };
  }

  return { ok: true, id: data.id };
}
