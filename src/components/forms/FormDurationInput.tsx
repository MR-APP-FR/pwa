'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';

function parseNonNegativeInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface DurationValue {
  minutes: number | null;
  seconds: number | null;
}

interface FormDurationInputProps {
  label: string;
  value: DurationValue;
  onChange: (value: DurationValue) => void;
  required?: boolean;
  error?: boolean;
}

export function FormDurationInput({
  label,
  value,
  onChange,
  required,
  error,
}: FormDurationInputProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const borderColor = error ? colors.DANGER : colors.BORDER;

  const inputClassName =
    'min-h-[48px] w-full rounded-xl border px-3 py-3 text-base text-center';

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
            *
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs font-medium" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.common.durationMinutes')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={value.minutes === null ? '' : String(value.minutes)}
            placeholder={t('forms.common.placeholderCount')}
            onChange={(e) => onChange({ ...value, minutes: parseNonNegativeInt(e.target.value) })}
            aria-required={required}
            aria-invalid={error}
            className={inputClassName}
            style={{
              color: colors.TEXT_PRIMARY,
              borderColor,
              backgroundColor: colors.BG_SECONDARY,
              borderRadius: RADIUS.sm,
            }}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.common.durationSeconds')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={value.seconds === null ? '' : String(value.seconds)}
            placeholder={t('forms.common.placeholderCount')}
            onChange={(e) => {
              const parsed = parseNonNegativeInt(e.target.value);
              if (parsed === null) {
                onChange({ ...value, seconds: null });
                return;
              }
              onChange({ ...value, seconds: Math.min(parsed, 59) });
            }}
            aria-required={required}
            aria-invalid={error}
            className={inputClassName}
            style={{
              color: colors.TEXT_PRIMARY,
              borderColor,
              backgroundColor: colors.BG_SECONDARY,
              borderRadius: RADIUS.sm,
            }}
          />
        </div>
      </div>
    </div>
  );
}
