'use server';

export type ClaimLoginResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; code: 'unknown_login' | 'invalid_credentials' | 'invalid_input' | 'server_error' };

export async function claimLogin(
  login: string,
  password: string,
): Promise<ClaimLoginResult> {
  const trimmedLogin = login.trim();
  if (!trimmedLogin || !password || password.length < 6) {
    return { ok: false, code: 'invalid_input' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    return { ok: false, code: 'server_error' };
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/claim-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ login: trimmedLogin, password }),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      access_token?: string;
      refresh_token?: string;
    };

    if (res.ok && payload.access_token && payload.refresh_token) {
      return {
        ok: true,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      };
    }

    if (payload.error === 'unknown_login') {
      return { ok: false, code: 'unknown_login' };
    }
    if (
      payload.error === 'invalid_credentials' ||
      payload.error === 'invalid_password' ||
      payload.error === 'invalid_login'
    ) {
      return { ok: false, code: 'invalid_credentials' };
    }

    return { ok: false, code: 'server_error' };
  } catch {
    return { ok: false, code: 'server_error' };
  }
}
