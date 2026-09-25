import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_VIEW_COOKIE } from '../auth/adminView';

/** Évite les blocages navigator.locks (~10 s) dans le middleware Edge. */
async function noOpAuthLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  return await fn();
}

/**
 * Rafraîchit la session Supabase et redirige vers /login si non authentifié.
 * `getSession()` + lock no-op — pas de `getUser()` réseau (latence 5–10 s).
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
      auth: {
        lock: noOpAuthLock,
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/dev/bypass-login') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json';
  const isPremiereConnexionRoute = pathname.startsWith('/premiere-connexion');
  const isApiRoute = pathname.startsWith('/api');
  const isProfilRoute = pathname.startsWith('/profil');
  const hasAdminView = Boolean(request.cookies.get(ADMIN_VIEW_COOKIE)?.value);

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // En local, le bypass / switcher d'employé ne doit pas être bloqué par
  // le mur « première connexion ». En prod le flag reste obligatoire.
  const enforcePasswordChange = process.env.NODE_ENV !== 'development';

  // Mot de passe temporaire (provisioning auto) : force /premiere-connexion tant que
  // public.user.must_change_password = true pour l'employé résolu depuis la session.
  if (enforcePasswordChange && user && !isPublicRoute && !isPremiereConnexionRoute && !isApiRoute) {
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
    } else if (hasAdminView && !isProfilRoute) {
      // Admin CRM sans ligne public.user : doit choisir un employé sur /profil.
      const url = request.nextUrl.clone();
      url.pathname = '/profil';
      return NextResponse.redirect(url);
    }
  } else if (
    user &&
    hasAdminView &&
    !isPublicRoute &&
    !isProfilRoute &&
    !isApiRoute &&
    !isPremiereConnexionRoute
  ) {
    // Même garde hors enforcePasswordChange (ex. NODE_ENV=development).
    const { data: employeeId } = await supabase.rpc('current_employee_id');
    const hasEmployee =
      typeof employeeId === 'number' ? employeeId > 0 : Number(employeeId) > 0;
    if (!hasEmployee) {
      const url = request.nextUrl.clone();
      url.pathname = '/profil';
      return NextResponse.redirect(url);
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
    } else if (hasAdminView) {
      const url = request.nextUrl.clone();
      url.pathname = '/profil';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
