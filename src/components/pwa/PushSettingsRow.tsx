'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { isPushAttentionNeeded, notifyPushStatusChanged, usePushStatus } from '../../hooks/usePushStatus';
import { subscribeAndSave } from '../../lib/push/client';
import { PrimaryButton } from '../common/PrimaryButton';

export function PushSettingsRow({ className }: { className?: string }) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { status, refresh } = usePushStatus();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'granted') return;
    void subscribeAndSave();
  }, [status]);

  // Si déjà autorisé, on (re)enregistre l'abonnement sans bloquer l'écran.

  async function handleEnable() {
    setPending(true);
    setError(null);
    const result = await subscribeAndSave();
    setPending(false);
    refresh();
    notifyPushStatusChanged();
    if (!result.ok) setError(result.error);
  }

  const attention = isPushAttentionNeeded(status);

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
      className={`mx-5 overflow-hidden rounded-2xl px-5 py-4 ${className ?? 'mt-7'}`}
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        boxShadow: colors.CARD_SHADOW,
        border: attention ? `2px solid ${colors.DANGER}` : `2px solid transparent`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: attention ? colors.ACCENT_RED_MUTED : colors.PRIMARY_MUTED,
          }}
        >
          <Bell size={18} color={attention ? colors.DANGER : colors.PRIMARY} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {t('settings.push.title')}
            </p>
            {attention ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: colors.ACCENT_RED_MUTED, color: colors.DANGER }}
              >
                {t('settings.profile.todo')}
              </span>
            ) : null}
          </div>
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
