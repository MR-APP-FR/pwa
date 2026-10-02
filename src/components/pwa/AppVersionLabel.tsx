'use client';

import { formatAppVersionLabel } from '../../lib/pwa/app-version';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

type AppVersionLabelProps = {
  className?: string;
};

/** Version app pour support bugs (login + paramètres). */
export function AppVersionLabel({ className }: AppVersionLabelProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <p
      className={className ?? 'text-center text-xs tabular-nums'}
      style={{ color: colors.TEXT_SECONDARY }}
      aria-label={`${t('settings.about.version')} ${formatAppVersionLabel()}`}
    >
      {t('settings.about.version')} {formatAppVersionLabel()}
    </p>
  );
}
