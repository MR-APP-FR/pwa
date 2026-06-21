'use client';

import Image from 'next/image';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { HOME_BUTTON_ICON_BG } from '../../constants/colors';
import { RADIUS } from '../../constants/design';

const ICON_MAP: Record<string, string> = {
  'sunny-outline': '/p_check.svg',
  'moon-outline': '/p_cadenas.svg',
  'calendar-outline': '/p_calendar.svg',
  'hand-left-outline': '/p_warning.svg',
  'messages-outline': '/p_warning.png',
  'video-outline': '/p_play.svg',
  'map-pin-outline': '/p_marker.svg',
};

interface HomeButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function HomeButton({ icon, label, onPress, disabled, fullWidth }: HomeButtonProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const iconSrc = ICON_MAP[icon] ?? ICON_MAP['calendar-outline'];
  const iconBg = HOME_BUTTON_ICON_BG[icon] ?? HOME_BUTTON_ICON_BG['calendar-outline'];

  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-disabled={disabled}
      className={`relative flex min-h-[96px] flex-col items-center justify-center gap-2 p-3 transition-all duration-150 ${
        fullWidth ? 'col-span-2' : ''
      }`}
      style={{
        backgroundColor: disabled ? colors.BG_TERTIARY : colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.md,
        boxShadow: disabled ? 'none' : colors.CARD_SHADOW,
        border: disabled ? `1px dashed ${colors.BORDER}` : `1px solid ${colors.BORDER}`,
        minHeight: 96,
      }}
    >
      {disabled && (
        <span
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
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
          width: 36,
          height: 36,
          borderRadius: RADIUS.sm,
          backgroundColor: disabled ? colors.BG_TERTIARY : iconBg,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Image
          src={iconSrc}
          alt=""
          width={20}
          height={20}
          aria-hidden
          className="h-5 w-5 object-contain"
        />
      </div>

      <span
        className="line-clamp-2 flex w-full min-h-[1.9em] items-center justify-center px-0.5 text-center font-semibold leading-[1.1] tracking-tight [font-size:clamp(11px,2.8vw,13px)]"
        style={{
          color: disabled ? colors.TEXT_MUTED : colors.TEXT_PRIMARY,
          fontFamily: 'var(--font-display)',
          textWrap: 'balance',
        }}
      >
        {label}
      </span>
    </button>
  );
}
