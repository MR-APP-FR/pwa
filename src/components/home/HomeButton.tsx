'use client';

import Image from 'next/image';
import { useThemeColors } from '../../hooks/useThemeColors';
import { HOME_BUTTON_ICON_BG } from '../../constants/colors';
import { glassCardClass } from '../../constants/glass';
import { RADIUS } from '../../constants/design';

const ICON_MAP: Record<string, string> = {
  'sunny-outline': '/p_check.svg',
  'moon-outline': '/p_cadenas.svg',
  'calendar-outline': '/p_calendar.svg',
  'hand-left-outline': '/p_warning.svg',
  'messages-outline': '/p_info.svg',
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
  const iconSrc = ICON_MAP[icon] ?? ICON_MAP['calendar-outline'];
  const iconBg = HOME_BUTTON_ICON_BG[icon] ?? HOME_BUTTON_ICON_BG['calendar-outline'];

  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-disabled={disabled}
      className={`${glassCardClass({ disabled })} flex min-h-[96px] flex-col items-center justify-center gap-2 p-3 transition-all duration-150 ${
        disabled ? 'cursor-not-allowed' : 'active:scale-[0.98]'
      } ${fullWidth ? 'col-span-2' : ''}`}
      style={{
        borderRadius: RADIUS.md,
        minHeight: 96,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: RADIUS.full,
          background: iconBg,
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
        className="line-clamp-2 flex w-full min-h-[2em] items-center justify-center px-0.5 text-center text-[clamp(13px,3.4vw,16px)] font-semibold uppercase leading-[1.15] tracking-wide"
        style={{
          color: colors.TEXT_PRIMARY,
          fontFamily: 'var(--font-display)',
          textWrap: 'balance',
        }}
      >
        {label}
      </span>
    </button>
  );
}
