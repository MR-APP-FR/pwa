'use client';

import { useThemeColors } from '../../hooks/useThemeColors';

interface ConditionalQuestionProps {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
}

export function ConditionalQuestion({
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
}: ConditionalQuestionProps) {
  const { colors } = useThemeColors();
  return (
    <div className="space-y-1">
      <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
        {label}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className="flex-1 py-2 rounded-lg border text-sm font-semibold"
          style={{
            borderColor: value === true ? colors.PRIMARY : colors.BORDER,
            backgroundColor: value === true ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
            color: value === true ? colors.PRIMARY : colors.TEXT_PRIMARY,
          }}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="flex-1 py-2 rounded-lg border text-sm font-semibold"
          style={{
            borderColor: value === false ? colors.PRIMARY : colors.BORDER,
            backgroundColor: value === false ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
            color: value === false ? colors.PRIMARY : colors.TEXT_PRIMARY,
          }}
        >
          {noLabel}
        </button>
      </div>
    </div>
  );
}
