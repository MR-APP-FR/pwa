'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { RADIUS } from '../../constants/design';

interface FormSectionProps {
  title: string;
  optional?: boolean;
  optionalLabel?: string;
  danger?: boolean;
  children: React.ReactNode;
}

export function FormSection({ title, optional, optionalLabel, danger, children }: FormSectionProps) {
  const { colors } = useThemeColors();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: danger ? colors.DANGER : colors.PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h3>
        {optional && optionalLabel && (
          <span className="text-[10px] font-medium" style={{ color: colors.TEXT_MUTED }}>
            {optionalLabel}
          </span>
        )}
        <div className="h-px flex-1" style={{ backgroundColor: colors.BORDER }} />
      </div>
      <div
        className="space-y-4 rounded-xl px-4 py-4"
        style={{
          backgroundColor: danger ? colors.ACCENT_RED_MUTED : colors.BG_TERTIARY,
          borderRadius: RADIUS.md,
          border: danger ? `1px solid ${colors.DANGER}` : undefined,
        }}
      >
        {children}
      </div>
    </section>
  );
}
