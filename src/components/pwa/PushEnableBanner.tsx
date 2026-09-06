'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { notifyPushStatusChanged, usePushStatus } from '../../hooks/usePushStatus';
import { RADIUS } from '../../constants/design';
import { subscribeAndSave } from '../../lib/push/client';
import { PWA_PUSH_BANNER_DISMISS_KEY } from '../../lib/pwa/cutover';
import { PrimaryButton } from '../common/PrimaryButton';

export function PushEnableBanner() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { status, refresh } = usePushStatus();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem(PWA_PUSH_BANNER_DISMISS_KEY));
  });

  async function handleEnable() {
    setPending(true);
    setError(null);
    const result = await subscribeAndSave();
    setPending(false);
    refresh();
    notifyPushStatusChanged();
    if (!result.ok) {
      setError(result.error);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(PWA_PUSH_BANNER_DISMISS_KEY, 'true');
  }

  if (dismissed || status !== 'default') return null;

  return (
    <div
      className="flex items-start gap-3 p-4"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.md,
        boxShadow: colors.CARD_SHADOW,
        border: `1px solid ${colors.BORDER}`,
      }}
    >
      <div
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.PRIMARY_MUTED }}
      >
        <Bell size={18} color={colors.PRIMARY} strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
          {t('settings.push.title')}
        </p>
        <p className="mt-0.5 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          {t('settings.push.banner')}
        </p>
        {error ? (
          <p className="mt-1 text-xs" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
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
