'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import type { ThemeColors } from '../../types/theme.types';
import { RADIUS } from '../../constants/design';

type YesNoTone = 'yes' | 'no';

function yesNoOptionStyle(
  colors: ThemeColors,
  tone: YesNoTone,
  selected: boolean,
  error?: boolean,
  invertSelectedColors?: boolean,
) {
  if (!selected) {
    return {
      borderRadius: RADIUS.sm,
      backgroundColor: colors.BG_SECONDARY,
      color: colors.TEXT_PRIMARY,
      boxShadow: `inset 0 0 0 1px ${error ? colors.DANGER : colors.BORDER}`,
      fontFamily: 'var(--font-display)',
    } as const;
  }

  const isYes = tone === 'yes';
  const positive = invertSelectedColors ? !isYes : isYes;
  return {
    borderRadius: RADIUS.sm,
    backgroundColor: positive ? colors.ACCENT_GREEN_MUTED : colors.ACCENT_RED_MUTED,
    color: positive ? colors.ACCENT_GREEN : colors.ACCENT_RED,
    boxShadow: `inset 0 0 0 2px ${positive ? colors.ACCENT_GREEN : colors.ACCENT_RED}`,
    fontFamily: 'var(--font-display)',
  } as const;
}

interface YesNoToggleProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel: string;
  noLabel: string;
  compact?: boolean;
  error?: boolean;
  /** Affiche Non avant Oui */
  noFirst?: boolean;
  /** Non = vert, Oui = rouge (ex. signalement de pannes) */
  invertSelectedColors?: boolean;
}

export function YesNoToggle({
  value,
  onChange,
  yesLabel,
  noLabel,
  compact,
  error,
  noFirst,
  invertSelectedColors,
}: YesNoToggleProps) {
  const { colors } = useThemeColors();
  const sizeClass = compact
    ? 'min-h-[40px] min-w-[3.25rem] px-3 py-1.5 text-xs'
    : 'min-h-[48px] flex-1 py-2.5 text-sm';

  const noButton = (
    <button
      key="no"
      type="button"
      onClick={() => onChange(false)}
      className={`${sizeClass} font-bold transition-all active:scale-[0.98]`}
      style={yesNoOptionStyle(colors, 'no', value === false, error, invertSelectedColors)}
      aria-pressed={value === false}
    >
      {noLabel}
    </button>
  );

  const yesButton = (
    <button
      key="yes"
      type="button"
      onClick={() => onChange(true)}
      className={`${sizeClass} font-bold transition-all active:scale-[0.98]`}
      style={yesNoOptionStyle(colors, 'yes', value === true, error, invertSelectedColors)}
      aria-pressed={value === true}
    >
      {yesLabel}
    </button>
  );

  return (
    <div className={`flex ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {noFirst ? [noButton, yesButton] : [yesButton, noButton]}
    </div>
  );
}
