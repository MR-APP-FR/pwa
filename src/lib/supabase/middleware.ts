import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rafraîchit la session Supabase et redirige vers /login si non authentifié.
 * Calqué sur admin-desktop-app/lib/supabase/middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/dev/bypass-login') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json';
  const isPremiereConnexionRoute = pathname.startsWith('/premiere-connexion');
  const isApiRoute = pathname.startsWith('/api');

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Mot de passe temporaire (provisioning auto) : force /premiere-connexion tant que
  // public.user.must_change_password = true pour l'employé résolu depuis la session.
  if (user && !isPublicRoute && !isPremiereConnexionRoute && !isApiRoute) {
    const { data: employeeId } = await supabase.rpc('current_employee_id');
    if (typeof employeeId === 'number' && employeeId > 0) {
      const { data: userRow } = await supabase
        .from('user')
        .select('must_change_password')
        .eq('id', employeeId)
        .single();

      if (userRow?.must_change_password) {
        const url = request.nextUrl.clone();
        url.pathname = '/premiere-connexion';
        return NextResponse.redirect(url);
      }
    }
  }

  if (user && isPremiereConnexionRoute) {
    const { data: employeeId } = await supabase.rpc('current_employee_id');
    if (typeof employeeId === 'number' && employeeId > 0) {
      const { data: userRow } = await supabase
        .from('user')
        .select('must_change_password')
        .eq('id', employeeId)
        .single();

      if (!userRow?.must_change_password) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
