'use client';

import type { LucideIcon } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import type { ThemeColors } from '../../types/theme.types';

interface TrainingThemeCardProps {
  icon: LucideIcon;
  labelKey: string;
  color: keyof ThemeColors;
  muted: keyof ThemeColors;
  colSpan?: 1 | 2;
  onPress?: () => void;
  disabled?: boolean;
}

export function TrainingThemeCard({
  icon: Icon,
  labelKey,
  color,
  muted,
  colSpan = 1,
  onPress,
  disabled = false,
}: TrainingThemeCardProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const iconColor = colors[color];
  const iconBg = colors[muted];

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || !onPress}
      aria-disabled={disabled || !onPress}
      className={`relative flex min-h-[112px] flex-col items-center justify-center gap-2.5 p-3 transition-all duration-150 active:scale-[0.98] ${
        colSpan === 2 ? 'col-span-2' : ''
      }`}
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.md,
        boxShadow: colors.CARD_SHADOW,
        border: `1px solid ${colors.BORDER}`,
        minHeight: Math.max(112, TOUCH_TARGET * 2),
      }}
    >
      {(disabled || !onPress) && (
        <span
          className="absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide"
          style={{
            backgroundColor: colors.BG_TERTIARY,
            color: colors.TEXT_MUTED,
            fontFamily: 'var(--font-display)',
          }}
        >
          {t('screens.home.comingSoon')}
        </span>
      )}

      <div
        className="flex items-center justify-center"
        style={{
          width: 52,
          height: 52,
          borderRadius: RADIUS.sm,
          backgroundColor: iconBg,
        }}
      >
        <Icon size={28} color={iconColor} strokeWidth={2} />
      </div>

      <span
        className="line-clamp-3 w-full px-0.5 text-center text-[11px] font-bold uppercase leading-tight tracking-tight"
        style={{
          color: colors.TEXT_PRIMARY,
          fontFamily: 'var(--font-display)',
          textWrap: 'balance',
        }}
      >
        {t(labelKey)}
      </span>
    </button>
  );
}
