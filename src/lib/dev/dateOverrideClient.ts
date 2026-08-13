export const DEV_DATE_OVERRIDE_COOKIE = 'dev_now_override';

/** Lit la date simulée (dev uniquement) posée par le panneau dev de `/profil`. */
export function getDevDateOverride(): Date | null {
  if (process.env.NODE_ENV !== 'development') return null;
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${DEV_DATE_OVERRIDE_COOKIE}=([^;]*)`));
  if (!match) return null;
  const date = new Date(decodeURIComponent(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}
