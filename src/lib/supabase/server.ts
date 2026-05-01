import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase cookie-bound server client (Server Components, Route Handlers,
 * Server Actions). Calque sur admin-desktop-app/lib/supabase/server.ts.
 *
 * Cf. GRE-86. L'auth réelle (middleware + redirection /login, GRE-88) est
 * différée ; ce client est livré pour pouvoir consommer Supabase en lecture
 * server-side dès maintenant (ex. fetch initial du profil sélectionné par
 * GRE-87 dans un futur Server Component).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components peuvent ignorer ; les cookies seront refresh
            // par le middleware côté Route Handler quand l'auth réelle sera
            // livrée (GRE-88).
          }
        },
      },
    },
  );
}
