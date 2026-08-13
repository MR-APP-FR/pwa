import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Client service-role réservé au dev local (switcher d'employé de `/profil`).
 * Jamais utilisé en prod : `SUPABASE_SERVICE_ROLE_KEY` n'est pas défini sur Vercel
 * (cf. CLAUDE.md) et cette fonction refuse d'agir hors NODE_ENV=development.
 */
export function createDevServiceClient() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('createDevServiceClient: réservé au dev local.');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant dans pwa/.env (dev local uniquement).');
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
