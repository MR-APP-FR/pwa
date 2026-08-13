'use server';

import { cookies } from 'next/headers';
import { createDevServiceClient } from '../../lib/dev/devServiceClient';
import { DEV_DATE_OVERRIDE_COOKIE } from '../../lib/dev/dateOverrideClient';

export type DevSwitchableUser = { id: number; fullname: string; login: string };

/** Liste des employés actifs, pour le sélecteur du panneau dev de `/profil`. */
export async function listDevSwitchableUsers(): Promise<DevSwitchableUser[]> {
  if (process.env.NODE_ENV !== 'development') return [];
  const supabase = createDevServiceClient();
  const { data, error } = await supabase
    .from('user')
    .select('id, fullname, login')
    .eq('actif', true)
    .order('fullname');
  if (error || !data) return [];
  return data as DevSwitchableUser[];
}

export async function setDevDateOverride(dateIso: string | null): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  const store = await cookies();
  if (!dateIso) {
    store.delete(DEV_DATE_OVERRIDE_COOKIE);
    return;
  }
  store.set(DEV_DATE_OVERRIDE_COOKIE, dateIso, { path: '/', maxAge: 60 * 60 * 24 * 30 });
}
