'use client';

import { useEffect } from 'react';
import {
  CLIENT_APP_VERSION,
  PWA_VERSION_CHECK_MIN_MS,
  PWA_VERSION_RELOAD_KEY,
} from '../../lib/pwa/app-version';

/**
 * À l’ouverture / retour au premier plan : si le déploiement Vercel a changé,
 * recharge la PWA (y compris installée en standalone / onglet).
 */
export function PwaVersionWatcher() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (CLIENT_APP_VERSION === 'dev') return;

    let cancelled = false;
    let lastCheckAt = 0;

    async function checkForUpdate() {
      const now = Date.now();
      if (now - lastCheckAt < PWA_VERSION_CHECK_MIN_MS) return;
      lastCheckAt = now;

      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
        }

        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { version?: string };
        const serverVersion = data.version?.trim();
        if (!serverVersion || serverVersion === 'dev') return;
        if (serverVersion === CLIENT_APP_VERSION) return;

        // Évite une boucle si le HTML reste coincé sur un vieux bundle.
        if (sessionStorage.getItem(PWA_VERSION_RELOAD_KEY) === serverVersion) return;
        sessionStorage.setItem(PWA_VERSION_RELOAD_KEY, serverVersion);
        window.location.reload();
      } catch {
        // hors-ligne / réseau — ignorer
      }
    }

    void checkForUpdate();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return null;
}
