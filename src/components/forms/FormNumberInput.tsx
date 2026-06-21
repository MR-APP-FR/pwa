'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import { FieldHelp } from './FieldHelp';

function parseNumber(value: string): number | null {
  const trimmed = value.replace(',', '.').trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

interface FormNumberInputProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: 'eur' | 'count';
  required?: boolean;
  error?: boolean;
  helpText?: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
}

export function FormNumberInput({
  label,
  value,
  onChange,
  unit,
  required,
  error,
  helpText,
  placeholder,
  inputMode = 'decimal',
}: FormNumberInputProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const borderColor = error ? colors.DANGER : colors.BORDER;
  const displayValue = value === null ? '' : String(value);
  const resolvedPlaceholder =
    placeholder ??
    (unit === 'eur'
      ? t('forms.common.placeholderAmount')
      : t('forms.common.placeholderCount'));

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <label className="text-sm font-semibold leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
          {label}
          {required && (
            <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
              *
            </span>
          )}
        </label>
        {helpText && <FieldHelp text={helpText} />}
      </div>
      <div className="relative flex items-stretch">
        {unit === 'eur' && (
          <span
            className="flex min-h-[48px] shrink-0 items-center rounded-l-xl border border-r-0 px-3 text-sm font-semibold"
            style={{
              color: colors.TEXT_SECONDARY,
              borderColor,
              backgroundColor: colors.BG_SECONDARY,
              borderTopLeftRadius: RADIUS.sm,
              borderBottomLeftRadius: RADIUS.sm,
            }}
          >
            €
          </span>
        )}
        <input
          type="text"
          inputMode={inputMode}
          value={displayValue}
          placeholder={resolvedPlaceholder}
          onChange={(e) => onChange(parseNumber(e.target.value))}
          aria-required={required}
          aria-invalid={error}
          className={`min-h-[48px] w-full border px-3 py-3 text-base ${unit === 'eur' ? 'rounded-r-xl rounded-l-none' : 'rounded-xl'}`}
          style={{
            color: colors.TEXT_PRIMARY,
            borderColor,
            backgroundColor: colors.BG_SECONDARY,
            borderRadius: unit === 'eur' ? undefined : RADIUS.sm,
          }}
        />
      </div>
    </div>
  );
}
