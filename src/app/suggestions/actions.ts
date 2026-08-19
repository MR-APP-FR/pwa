'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

/**
 * Boîte à idées (hors messagerie staff).
 * RPC `submit_suggestion_anonyme` : pose toujours `user_id = current_employee_id()`,
 * plus le flag `is_anonymous` pour l'indicateur CRM.
 */

const CATEGORIES = ['materiel', 'organisation', 'ambiance', 'autres'] as const;

export type SubmitSuggestionResult = { ok: true } | { ok: false; error: string };

export async function submitSuggestion(
  corps: string,
  categorie: string | null,
  isAnonymous: boolean,
): Promise<SubmitSuggestionResult> {
  const trimmed = corps.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Message vide.' };
  }

  const cat = categorie?.trim() || null;
  if (cat && !(CATEGORIES as readonly string[]).includes(cat)) {
    return { ok: false, error: 'Catégorie invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await session.supabase.rpc('submit_suggestion_anonyme', {
    corps: trimmed,
    categorie: cat,
    is_anonymous: isAnonymous,
  });

  if (error) {
    return { ok: false, error: `Envoi échoué : ${error.message}` };
  }
  return { ok: true };
}
