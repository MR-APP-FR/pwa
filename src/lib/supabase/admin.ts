import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase service-role (server only).
 * Bypass RLS — utilisé pour le profile switcher démo (GRE-87) tant que l'auth
 * réelle n'est pas livrée. Ne jamais exposer côté client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
