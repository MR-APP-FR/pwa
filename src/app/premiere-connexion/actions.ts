'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

/**
 * Change le mot de passe temporaire (provisioning auto) et lève le flag
 * `must_change_password` sur `public.user`. Client cookie-bound (RLS standard) :
 * l'utilisateur ne change que son propre mot de passe.
 */

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

interface ChangePasswordInput {
  password: string;
  passwordConfirmation: string;
}

function parseInput(formData: FormData): ChangePasswordInput | { error: string } {
  const password = String(formData.get('password') ?? '');
  const passwordConfirmation = String(formData.get('passwordConfirmation') ?? '');

  if (password.length < 8) {
    return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };
  }
  if (password !== passwordConfirmation) {
    return { error: 'Les mots de passe ne correspondent pas.' };
  }

  return { password, passwordConfirmation };
}

export async function changeTemporaryPassword(formData: FormData): Promise<ChangePasswordResult> {
  const parsed = parseInput(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { supabase } = session;

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.password });
  if (updateError) {
    return { ok: false, error: `Impossible de changer le mot de passe : ${updateError.message}` };
  }

  // Pas de policy UPDATE sur public.user côté employé : la remise à false du flag
  // passe par une fonction SECURITY DEFINER dédiée, scoped à current_employee_id().
  const { error: flagError } = await supabase.rpc('mark_password_changed');

  if (flagError) {
    return {
      ok: false,
      error: `Mot de passe changé mais mise à jour du statut échouée : ${flagError.message}`,
    };
  }

  return { ok: true };
}
