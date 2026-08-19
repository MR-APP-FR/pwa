'use client';

import { useEffect, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { canUseWebPush, subscribeAndSave } from '../../lib/push/client';
import { PrimaryButton } from '../common/PrimaryButton';

const DISMISS_KEY = 'pwa-push-banner-dismissed';

export function PushEnableBanner() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseWebPush()) return;

    if (Notification.permission === 'granted') {
      void subscribeAndSave();
      return;
    }

    if (Notification.permission === 'default' && !localStorage.getItem(DISMISS_KEY)) {
      setShow(true);
    }
  }, []);

  async function handleEnable() {
    setPending(true);
    setError(null);
    const result = await subscribeAndSave();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShow(false);
  }

  function handleDismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, 'true');
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t p-4 backdrop-blur-md"
      style={{
        backgroundColor: colors.HEADER_BG,
        borderColor: colors.BORDER,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
      }}
    >
      <div className="mx-auto flex max-w-md items-start gap-3">
        <div className="flex-1">
          <p className="text-sm" style={{ color: colors.TEXT_PRIMARY }}>
            {t('settings.push.banner')}
          </p>
          {error ? (
            <p className="mt-1 text-xs" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <PrimaryButton onClick={() => void handleEnable()} disabled={pending} className="px-4 py-2 text-sm">
            {pending ? t('settings.push.enabling') : t('settings.push.enable')}
          </PrimaryButton>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg px-2 py-1.5 text-sm"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            {t('settings.push.later')}
          </button>
        </div>
      </div>
    </div>
  );
}
