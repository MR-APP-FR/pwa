'use server';

import { cookies } from 'next/headers';
import { createClient } from '../supabase/server';
import {
  ADMIN_VIEW_COOKIE,
  ADMIN_VIEW_MAX_AGE_SEC,
  ADMIN_VIEW_UI_COOKIE,
  type AdminSwitchableUser,
} from './adminView';

type EdgePayload = {
  error?: string;
  view_token?: string;
  admin_email?: string;
  employees?: AdminSwitchableUser[];
  token_hash?: string;
};

async function callAdminPwaView(
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<{ ok: true; data: EdgePayload } | { ok: false; error: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    return { ok: false, error: 'server_misconfigured' };
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/admin-pwa-view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken ?? anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as EdgePayload;
    if (!res.ok) {
      return { ok: false, error: payload.error ?? 'edge_error' };
    }
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

async function setAdminViewCookies(viewToken: string, adminEmail: string) {
  const store = await cookies();
  store.set(ADMIN_VIEW_COOKIE, viewToken, cookieOptions(ADMIN_VIEW_MAX_AGE_SEC));
  store.set(ADMIN_VIEW_UI_COOKIE, adminEmail, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_VIEW_MAX_AGE_SEC,
  });
}

export async function clearAdminViewCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_VIEW_COOKIE);
  store.delete(ADMIN_VIEW_UI_COOKIE);
}

export async function getAdminViewStatus(): Promise<{
  active: boolean;
  adminEmail: string | null;
}> {
  const store = await cookies();
  const token = store.get(ADMIN_VIEW_COOKIE)?.value;
  const email = store.get(ADMIN_VIEW_UI_COOKIE)?.value ?? null;
  return { active: Boolean(token), adminEmail: token ? email : null };
}

/**
 * Après login admin CRM sur la PWA : mint le view_token + cookie.
 * Passer `accessToken` depuis le client juste après `signInWithPassword`
 * (les cookies session peuvent ne pas être encore visibles côté Server Action).
 */
export async function startAdminView(accessToken?: string): Promise<
  | { ok: true; adminEmail: string; employees: AdminSwitchableUser[] }
  | { ok: false; error: string }
> {
  let token = accessToken?.trim() || '';
  if (!token) {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? '';
  }
  if (!token) {
    return { ok: false, error: 'not_authenticated' };
  }

  const result = await callAdminPwaView({ action: 'mint' }, token);
  if (!result.ok) return result;

  const viewToken = result.data.view_token;
  const adminEmail = result.data.admin_email;
  if (!viewToken || !adminEmail) {
    return { ok: false, error: 'mint_failed' };
  }

  await setAdminViewCookies(viewToken, adminEmail);
  return {
    ok: true,
    adminEmail,
    employees: result.data.employees ?? [],
  };
}

export async function listAdminSwitchableUsers(): Promise<AdminSwitchableUser[]> {
  const store = await cookies();
  const viewToken = store.get(ADMIN_VIEW_COOKIE)?.value;
  if (!viewToken) return [];

  const result = await callAdminPwaView({ action: 'list', view_token: viewToken });
  if (!result.ok) return [];
  return result.data.employees ?? [];
}

/**
 * Impersonation : retourne le token_hash magic link pour verifyOtp côté client.
 */
export async function requestAdminImpersonation(userId: number): Promise<
  | { ok: true; token_hash: string }
  | { ok: false; error: string }
> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { ok: false, error: 'invalid_user_id' };
  }

  const store = await cookies();
  const viewToken = store.get(ADMIN_VIEW_COOKIE)?.value;
  if (!viewToken) {
    return { ok: false, error: 'no_admin_view' };
  }

  const result = await callAdminPwaView({
    action: 'impersonate',
    view_token: viewToken,
    userId,
  });
  if (!result.ok) return result;

  const tokenHash = result.data.token_hash;
  if (!tokenHash) return { ok: false, error: 'impersonate_failed' };
  return { ok: true, token_hash: tokenHash };
}
