'use server';

import { createClient } from '../../lib/supabase/server';

/**
 * GRE-57 — server actions pour la page info-jour.
 *
 * - `createSujet` : insère un nouveau sujet (manège) pour un site quand
 *   l'employé en signale un absent. Aligné sur la table `sujets` admin.
 * - `submitDailyInfo` : insère une ligne dans `daily_info`. Le trigger
 *   `create_intervention_from_panne` (GRE-128) crée automatiquement la
 *   ligne `intervention` côté admin si `pannes_sujet_ids`, `pannes_autre`
 *   ou `pannes` non vides.
 *
 * Mode démo : `userId` est passé par le client (profile switcher GRE-87).
 * Quand l'auth réelle (GRE-54) sera livrée, le `user_id` sera dérivé de
 * la session via `current_employee_id()`.
 */

export type CreateSujetResult =
  | { ok: true; id: number; name: string; site_id: number }
  | { ok: false; error: string };

export async function createSujet(
  siteId: number,
  rawName: string,
): Promise<CreateSujetResult> {
  if (!Number.isFinite(siteId) || siteId <= 0) {
    return { ok: false, error: 'Site invalide.' };
  }
  const name = rawName.trim();
  if (name.length === 0) {
    return { ok: false, error: 'Le nom du sujet est requis.' };
  }

  const supabase = await createClient();

  const existing = await supabase
    .from('sujets')
    .select('id, name, site_id, state')
    .eq('site_id', siteId)
    .ilike('name', name)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: `Lookup sujet a échoué : ${existing.error.message}` };
  }

  if (existing.data) {
    if (!existing.data.state) {
      const reactivated = await supabase
        .from('sujets')
        .update({ state: true })
        .eq('id', existing.data.id)
        .select('id, name, site_id')
        .single();
      if (reactivated.error) {
        return { ok: false, error: `Reactivation sujet a échoué : ${reactivated.error.message}` };
      }
      return { ok: true, ...reactivated.data };
    }
    return {
      ok: true,
      id: existing.data.id,
      name: existing.data.name,
      site_id: existing.data.site_id,
    };
  }

  const inserted = await supabase
    .from('sujets')
    .insert({ site_id: siteId, name, state: true })
    .select('id, name, site_id')
    .single();

  if (inserted.error) {
    return { ok: false, error: `Création sujet a échoué : ${inserted.error.message}` };
  }
  return { ok: true, ...inserted.data };
}

export type SubmitDailyInfoResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

interface SubmitDailyInfoInput {
  siteId: number;
  userId: number;
  /** Format ISO date YYYY-MM-DD — date de la mission */
  date: string;
  nettoyageVeille: boolean | null;
  panneSujetIds: number[];
  pannesAutre: string | null;
  pannes: string | null;
  carteParking: boolean | null;
  musiqueDisney: boolean | null;
}

export async function submitDailyInfo(
  input: SubmitDailyInfoInput,
): Promise<SubmitDailyInfoResult> {
  if (!Number.isFinite(input.siteId) || input.siteId <= 0) {
    return { ok: false, error: 'Site invalide.' };
  }
  if (!Number.isFinite(input.userId) || input.userId <= 0) {
    return { ok: false, error: 'Utilisateur invalide.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: 'Date invalide.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('daily_info')
    .insert({
      site_id: input.siteId,
      user_id: input.userId,
      date: input.date,
      nettoyage_veille: input.nettoyageVeille,
      pannes_sujet_ids: input.panneSujetIds,
      pannes_autre: input.pannesAutre,
      pannes: input.pannes,
      carte_parking: input.carteParking,
      musique_disney: input.musiqueDisney,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: `Insert daily_info a échoué : ${error.message}` };
  }
  return { ok: true, id: data.id };
}
