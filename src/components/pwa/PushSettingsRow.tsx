'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import {
  canUseWebPush,
  isIosDevice,
  isStandalonePwa,
  subscribeAndSave,
} from '../../lib/push/client';
import { PrimaryButton } from '../common/PrimaryButton';

type PushStatus = 'loading' | 'need-install' | 'unsupported' | 'default' | 'granted' | 'denied';

export function PushSettingsRow() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isIosDevice() && !isStandalonePwa()) {
      setStatus('need-install');
      return;
    }
    if (!canUseWebPush()) {
      setStatus('unsupported');
      return;
    }
    setStatus(Notification.permission);
  }, []);

  useEffect(() => {
    refresh();
    if (canUseWebPush() && Notification.permission === 'granted') {
      void subscribeAndSave();
    }
  }, [refresh]);

  async function handleEnable() {
    setPending(true);
    setError(null);
    const result = await subscribeAndSave();
    setPending(false);
    refresh();
    if (!result.ok) setError(result.error);
  }

  const hint =
    status === 'need-install'
      ? t('settings.push.needInstall')
      : status === 'unsupported'
        ? t('settings.push.unsupported')
        : status === 'denied'
          ? t('settings.push.denied')
          : status === 'granted'
            ? t('settings.push.enabled')
            : t('settings.push.banner');

  return (
    <div
      className="mx-5 mt-7 overflow-hidden rounded-2xl px-5 py-4"
      style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.PRIMARY_MUTED }}
        >
          <Bell size={18} color={colors.PRIMARY} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
            {t('settings.push.title')}
          </p>
          <p className="mt-0.5 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {hint}
          </p>
          {error ? (
            <p className="mt-1 text-xs" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
              {error}
            </p>
          ) : null}
          {status === 'default' ? (
            <PrimaryButton
              onClick={() => void handleEnable()}
              disabled={pending}
              className="mt-3 px-4 py-2 text-sm"
            >
              {pending ? t('settings.push.enabling') : t('settings.push.enable')}
            </PrimaryButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
