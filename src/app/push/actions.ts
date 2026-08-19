'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

export type PushSubscribeResult = { ok: true } | { ok: false; error: string };

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<PushSubscribeResult> {
  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!endpoint.startsWith('https://') || p256dh.length < 8 || auth.length < 8) {
    return { ok: false, error: 'Abonnement invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await session.supabase.rpc('upsert_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: input.userAgent?.slice(0, 300) ?? null,
  });

  if (error) {
    return { ok: false, error: `Enregistrement push échoué : ${error.message}` };
  }
  return { ok: true };
}
