'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function PrimaryButton({ children, className = '', style, disabled, ...props }: PrimaryButtonProps) {
  const { colors } = useThemeColors();

  return (
    <button
      type="button"
      disabled={disabled}
      className={`font-display font-semibold transition-all active:scale-[0.98] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      style={{
        backgroundColor: colors.PRIMARY,
        backgroundImage: 'none',
        color: colors.TEXT_INVERSE,
        borderRadius: RADIUS.sm,
        minHeight: TOUCH_TARGET,
        fontFamily: 'var(--font-display)',
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
