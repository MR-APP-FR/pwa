import { cookies } from 'next/headers';
import { DEV_DATE_OVERRIDE_COOKIE } from './dateOverrideClient';

/** Heure effective côté serveur (dev uniquement) : honore le cookie posé par `/profil`. */
export async function getDevOverrideNow(): Promise<Date | null> {
  if (process.env.NODE_ENV !== 'development') return null;
  const store = await cookies();
  const raw = store.get(DEV_DATE_OVERRIDE_COOKIE)?.value;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
