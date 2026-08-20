import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { createDevServiceClient } from '../../../lib/dev/devServiceClient';

/**
 * Connexion rapide dev local (`DEV_LOGIN_EMAIL`).
 * Magic link via service role : indépendant du mot de passe temporaire
 * (nouvelle auth / premiere-connexion).
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const email = process.env.DEV_LOGIN_EMAIL?.trim();
  if (!email) {
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

  try {
    const service = createDevServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error || !data.properties?.hashed_token) {
      console.error('Dev bypass generateLink:', error);
      return NextResponse.redirect(new URL('/login?dev_error=sign_in_failed', request.url));
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: 'email',
    });

    if (verifyError) {
      console.error('Dev bypass verifyOtp:', verifyError);
      return NextResponse.redirect(new URL('/login?dev_error=sign_in_failed', request.url));
    }

    return response;
  } catch (error) {
    console.error('Dev bypass unexpected:', error);
    return NextResponse.redirect(new URL('/login?dev_error=sign_in_failed', request.url));
  }
}
