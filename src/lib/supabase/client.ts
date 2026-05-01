import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase browser client (Client Components).
 *
 * Cf. GRE-86. Cohérent avec admin-desktop-app/lib/supabase/client.ts.
 * Auth réelle différée — la PWA est en mode démo (cf. GRE-87 profile switcher).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
