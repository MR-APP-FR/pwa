import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { createDevServiceClient } from '../../../lib/dev/devServiceClient';

/** Connexion instantanée en tant qu'un employé donné — dev local uniquement. */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const userId = Number(request.nextUrl.searchParams.get('userId'));
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.redirect(new URL('/profil?dev_error=invalid_user', request.url));
  }

  let response = NextResponse.redirect(new URL('/', request.url));

  try {
    const service = createDevServiceClient();
    const { data: userRow, error: userError } = await service
      .from('user')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !userRow?.email) {
      return NextResponse.redirect(new URL('/profil?dev_error=user_not_found', request.url));
    }

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

    const { data, error } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: userRow.email,
    });

    if (error || !data.properties?.hashed_token) {
      return NextResponse.redirect(new URL('/profil?dev_error=generate_link', request.url));
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: 'email',
    });

    if (verifyError) {
      return NextResponse.redirect(new URL('/profil?dev_error=verify_otp', request.url));
    }

    return response;
  } catch {
    return NextResponse.redirect(new URL('/profil?dev_error=unexpected', request.url));
  }
}
