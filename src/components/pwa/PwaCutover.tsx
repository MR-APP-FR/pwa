'use client';

import { useEffect } from 'react';
import { canUseWebPush, subscribeAndSave } from '../../lib/push/client';
import {
  PWA_CUTOVER_VERSION,
  PWA_INSTALL_BANNER_DISMISS_KEY,
  PWA_PUSH_BANNER_DISMISS_KEY,
} from '../../lib/pwa/cutover';

/**
 * Après login : si les notifs sont déjà autorisées (ex. ancienne PWA WP),
 * ré-enregistre l'abonnement vers la nouvelle SW / VAPID.
 */
export function PushResubscribeOnAuth() {
  useEffect(() => {
    if (!canUseWebPush()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void subscribeAndSave();
  }, []);

  return null;
}

/**
 * Premier chargement post-cutover : purge SW / caches legacy et reset dismiss banners.
 */
export function PwaCutoverBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(PWA_CUTOVER_VERSION) === 'done') return;

    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // best-effort
      }

      localStorage.removeItem(PWA_PUSH_BANNER_DISMISS_KEY);
      localStorage.removeItem(PWA_INSTALL_BANNER_DISMISS_KEY);
      localStorage.setItem(PWA_CUTOVER_VERSION, 'done');

      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        } catch {
          // layout script will retry on next load
        }
      }
    })();
  }, []);

  return null;
}
