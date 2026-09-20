import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Évite les blocages navigator.locks (~10 s) en Server Actions / RSC. */
async function noOpAuthLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  return await fn();
}

/**
 * Supabase cookie-bound server client (Server Components, Route Handlers,
 * Server Actions). Session lue via cookie ; pas de getUser réseau systématique.
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
            // Server Components peuvent ignorer ; refresh cookies via middleware.
          }
        },
      },
      auth: {
        lock: noOpAuthLock,
      },
    },
  );
}
