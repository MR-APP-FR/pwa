'use client';

import { useThemeColors } from '../../hooks/useThemeColors';

interface NotificationBadgeProps {
  count: number;
}

/** Bulle rouge de compteur — réutilisable (messages aujourd'hui, autres notifications en vague 2). */
export function NotificationBadge({ count }: NotificationBadgeProps) {
  const { colors } = useThemeColors();
  if (count <= 0) return null;

  return (
    <span
      aria-hidden
      className="absolute -right-1.5 -top-1.5 z-[100] flex min-w-[20px] items-center justify-center px-1 text-[11px] font-bold"
      style={{
        height: 20,
        borderRadius: 9999,
        backgroundColor: colors.DANGER,
        color: colors.TEXT_INVERSE,
        boxShadow: `0 0 0 2px ${colors.SETTINGS_SECTION_BG}`,
      }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
