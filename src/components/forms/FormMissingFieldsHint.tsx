'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';

interface FormMissingFieldsHintProps {
  items: string[];
}

export function FormMissingFieldsHint({ items }: FormMissingFieldsHintProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <div
      className="mb-3 rounded-xl border px-3.5 py-3"
      style={{
        borderColor: colors.ACCENT_ORANGE + '55',
        backgroundColor: colors.ACCENT_ORANGE + '12',
        borderRadius: RADIUS.md,
      }}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-bold" style={{ color: colors.ACCENT_ORANGE }}>
        {t('forms.common.missingFieldsTitle')}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
