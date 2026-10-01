/** Version embarquée dans le bundle client (inlinée au build via next.config). */
export const CLIENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

export const PWA_VERSION_RELOAD_KEY = 'pwa-reloaded-for-version';

/** Intervalle mini entre deux checks réseau (évite spam focus iOS). */
export const PWA_VERSION_CHECK_MIN_MS = 30_000;
