import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase browser client (Client Components).
 * Cohérent avec admin-desktop-app/lib/supabase/client.ts.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
