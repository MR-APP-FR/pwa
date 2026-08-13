'use server';

import { createClient } from '../../lib/supabase/server';

/**
 * Doléance anonyme (B6) : appelle le RPC `submit_suggestion_anonyme`
 * (`SECURITY DEFINER`, n'écrit jamais `auth.uid()`). Pas de résolution
 * d'employé ici — l'anonymat vaut aussi côté serveur applicatif.
 */

export type SubmitSuggestionResult = { ok: true } | { ok: false; error: string };

export async function submitSuggestionAnonyme(
  corps: string,
  categorie: string | null,
): Promise<SubmitSuggestionResult> {
  const trimmed = corps.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Message vide.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_suggestion_anonyme', {
    corps: trimmed,
    categorie,
  });

  if (error) {
    return { ok: false, error: `Envoi échoué : ${error.message}` };
  }
  return { ok: true };
}
