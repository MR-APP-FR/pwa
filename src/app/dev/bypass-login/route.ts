import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Connexion rapide dev local avec le compte de test (`DEV_LOGIN_EMAIL` /
 * `DEV_LOGIN_PASSWORD`, sans préfixe NEXT_PUBLIC_ — ces valeurs ne doivent
 * jamais atteindre le bundle client, cf. audit 2026-08-18 §3.7).
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.redirect(new URL('/login?dev_error=not_configured', request.url));
  }

  let response = NextResponse.redirect(new URL('/', request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.redirect(new URL('/login?dev_error=sign_in_failed', request.url));
  }

  return response;
}
