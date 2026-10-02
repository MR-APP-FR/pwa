/**
 * Version affichée aux employés (login + paramètres).
 * À incrémenter à chaque release / deploy notable pour le support bugs.
 */
export const APP_DISPLAY_VERSION = '1.0.2';

/** Version embarquée dans le bundle client (inlinée au build via next.config). */
export const CLIENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

export const PWA_VERSION_RELOAD_KEY = 'pwa-reloaded-for-version';

/** Intervalle mini entre deux checks réseau (évite spam focus iOS). */
export const PWA_VERSION_CHECK_MIN_MS = 30_000;

/** Libellé court pour l’UI (ex. `1.0.0` ou `1.0.0 · a1b2c3d`). */
export function formatAppVersionLabel(): string {
  const sha = CLIENT_APP_VERSION;
  if (!sha || sha === 'dev') return APP_DISPLAY_VERSION;
  return `${APP_DISPLAY_VERSION} · ${sha.slice(0, 7)}`;
}
