'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

export type UpdatePreferredSitesResult = { ok: true } | { ok: false; error: string };

/**
 * Remplace la liste des sites préférés de l'employé (`user_info_sites`).
 * Audit 2026-08-18 §4.2 : le bouton « Sauvegarder » de la modale
 * « Modifier mes sites » n'écrivait rien — RLS employé posée dans la même
 * migration que cette action (`user_info_sites employee insert/delete own`).
 */
export async function updatePreferredSites(siteIds: number[]): Promise<UpdatePreferredSitesResult> {
  const cleanIds = [...new Set(siteIds)].filter((id) => Number.isFinite(id) && id > 0);

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }
  const { userId, supabase } = session;

  const { data: userInfo, error: userInfoError } = await supabase
    .from('user_info')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (userInfoError) {
    return { ok: false, error: `Lecture profil échouée : ${userInfoError.message}` };
  }
  if (!userInfo) {
    return { ok: false, error: 'Profil incomplet : aucune fiche employé associée.' };
  }

  const { error: deleteError } = await supabase
    .from('user_info_sites')
    .delete()
    .eq('user_info_id', userInfo.id);

  if (deleteError) {
    return { ok: false, error: `Mise à jour des sites échouée : ${deleteError.message}` };
  }

  if (cleanIds.length > 0) {
    const { error: insertError } = await supabase
      .from('user_info_sites')
      .insert(cleanIds.map((siteId) => ({ user_info_id: userInfo.id, site_id: siteId })));

    if (insertError) {
      return { ok: false, error: `Mise à jour des sites échouée : ${insertError.message}` };
    }
  }

  return { ok: true };
}
