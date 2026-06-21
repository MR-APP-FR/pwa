'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { RADIUS } from '../../constants/design';
import { YesNoToggle } from '../common/YesNoToggle';

interface ConditionalQuestionProps {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
  required?: boolean;
  error?: boolean;
  noJustification?: string;
  onNoJustificationChange?: (v: string) => void;
  noJustificationPlaceholder?: string;
  noJustificationError?: boolean;
}

export function ConditionalQuestion({
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
  required,
  error,
  noJustification = '',
  onNoJustificationChange,
  noJustificationPlaceholder,
  noJustificationError,
}: ConditionalQuestionProps) {
  const { colors } = useThemeColors();
  const showJustification = value === false && onNoJustificationChange != null;

  return (
    <div className="space-y-2">
      <label
        className="text-sm font-bold"
        style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
      >
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
            *
          </span>
        )}
      </label>
      <YesNoToggle
        value={value}
        onChange={onChange}
        yesLabel={yesLabel}
        noLabel={noLabel}
        error={error}
      />
      {showJustification && (
        <div className="space-y-1 pt-0.5">
          <input
            type="text"
            value={noJustification}
            onChange={(e) => onNoJustificationChange(e.target.value)}
            placeholder={noJustificationPlaceholder}
            className="w-full rounded-xl border px-3 py-2.5 text-sm"
            style={{
              color: colors.TEXT_PRIMARY,
              borderColor: noJustificationError ? colors.DANGER : colors.BORDER,
              backgroundColor: colors.BG_SECONDARY,
              borderRadius: RADIUS.sm,
            }}
            aria-invalid={noJustificationError ?? false}
          />
        </div>
      )}
    </div>
  );
}
