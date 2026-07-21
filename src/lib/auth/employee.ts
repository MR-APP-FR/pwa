import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';

/**
 * Résout l'employé terrain (`public.user.id`) depuis la session Auth.
 * S'appuie sur le helper SQL `current_employee_id()` (bridge email Auth ↔ public.user).
 */
export async function requireEmployeeSession(): Promise<
  | { ok: true; userId: number; supabase: SupabaseClient }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Non authentifié.' };
  }

  const { data, error } = await supabase.rpc('current_employee_id');
  if (error) {
    return { ok: false, error: `Impossible de résoudre l'employé : ${error.message}` };
  }

  const userId = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(userId) || userId <= 0) {
    return {
      ok: false,
      error:
        "Compte non lié à un employé. Vérifie que l'email Auth correspond à public.user.email.",
    };
  }

  return { ok: true, userId, supabase };
}
