'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { RADIUS } from '../../constants/design';

interface FormLockedBannerProps {
  label: string;
}

/** Bandeau « déjà validé » au-dessus d'un formulaire figé. */
export function FormLockedBanner({ label }: FormLockedBannerProps) {
  const { colors } = useThemeColors();

  return (
    <div
      className="mb-3 flex items-center gap-2.5 rounded-xl px-3.5 py-3"
      style={{
        borderRadius: RADIUS.lg,
        backgroundColor: colors.ACCENT_GREEN_MUTED,
        boxShadow: `inset 0 0 0 1px ${colors.ACCENT_GREEN}55`,
      }}
      role="status"
    >
      <span className="text-lg leading-none" aria-hidden>
        ✓
      </span>
      <p
        className="text-sm font-bold leading-snug"
        style={{ color: colors.ACCENT_GREEN, fontFamily: 'var(--font-display)' }}
      >
        {label}
      </p>
    </div>
  );
}
