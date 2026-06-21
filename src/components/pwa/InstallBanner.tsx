'use client';

import { useState, useEffect } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { PrimaryButton } from '../common/PrimaryButton';

export function InstallBanner() {
  const { colors } = useThemeColors();
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    // Android: intercept beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: detect if not in standalone mode
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    if (isIos && !isStandalone) {
      const dismissed = localStorage.getItem('pwa-banner-dismissed');
      if (!dismissed) setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (deferredPrompt as any).prompt();
      setShow(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa-banner-dismissed', 'true');
  };

  if (!show) return null;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t p-4 backdrop-blur-md"
      style={{
        backgroundColor: colors.HEADER_BG,
        borderColor: colors.BORDER,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
      }}
    >
      <div className="max-w-md mx-auto flex items-start gap-3">
        <div className="flex-1">
          {isIos && !deferredPrompt ? (
            <p className="text-sm" style={{ color: colors.TEXT_PRIMARY }}>
              Pour installer l&apos;app : appuyez sur{' '}
              <span className="inline-block">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16,6 12,2 8,6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{' '}
              puis <strong>&quot;Sur l&apos;écran d&apos;accueil&quot;</strong>
            </p>
          ) : (
            <p className="text-sm" style={{ color: colors.TEXT_PRIMARY }}>
              Installez Manège pour un accès rapide et les notifications.
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {deferredPrompt && (
            <PrimaryButton onClick={handleInstall} className="px-4 py-2 text-sm">
              Installer
            </PrimaryButton>
          )}
          <button
            onClick={handleDismiss}
            className="px-2 py-1.5 rounded-lg text-sm"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
