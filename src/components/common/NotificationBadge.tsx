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
      className="absolute -right-2 -top-2 z-[100] flex min-w-7 items-center justify-center px-1.5 text-[13px] font-bold leading-none"
      style={{
        height: 28,
        borderRadius: 9999,
        backgroundColor: colors.DANGER,
        color: colors.TEXT_INVERSE,
      }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
