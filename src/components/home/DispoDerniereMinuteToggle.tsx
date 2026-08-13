'use client';

import { useState, useTransition } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import { useTodayAvailability } from '../../hooks/api/useTodayAvailability';
import { submitDispoDerniereMinute } from '../../app/availability/actions';
import { isBrowserOffline } from '../../lib/offline';

interface DispoDerniereMinuteToggleProps {
  dateIso: string;
}

/** Toggle « dispo si une journée se libère », affiché seulement si l'employé n'est pas déjà planifié (B4). */
export function DispoDerniereMinuteToggle({ dateIso }: DispoDerniereMinuteToggleProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: isDispo, refetch } = useTodayAvailability(dateIso);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (next: boolean) => {
    setError(null);
    if (next === (isDispo ?? false)) return;
    if (isBrowserOffline()) {
      setError(t('forms.common.errorOffline'));
      return;
    }
    startTransition(async () => {
      const result = await submitDispoDerniereMinute(dateIso, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refetch();
    });
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        border: `1px solid ${colors.BORDER}`,
        borderRadius: RADIUS.md,
        boxShadow: colors.CARD_SHADOW,
      }}
    >
      <span className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
        {t('screens.home.dispoDerniereMinute')}
      </span>
      <div className="flex items-center gap-1.5">
        <div
          className="flex shrink-0 gap-1 p-0.5"
          style={{ backgroundColor: colors.BG_TERTIARY, borderRadius: RADIUS.full }}
        >
          <button
            type="button"
            onClick={() => handleSelect(true)}
            disabled={pending}
            className="px-3 py-1 text-xs font-bold transition-all active:scale-[0.97]"
            style={{
              borderRadius: RADIUS.full,
              backgroundColor: isDispo ? colors.ACCENT_GREEN : 'transparent',
              color: isDispo ? colors.TEXT_INVERSE : colors.TEXT_SECONDARY,
            }}
          >
            {t('screens.home.dispoDerniereMinuteOn')}
          </button>
          <button
            type="button"
            onClick={() => handleSelect(false)}
            disabled={pending}
            className="px-3 py-1 text-xs font-bold transition-all active:scale-[0.97]"
            style={{
              borderRadius: RADIUS.full,
              backgroundColor: !isDispo ? colors.BG_SECONDARY : 'transparent',
              color: !isDispo ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY,
            }}
          >
            {t('screens.home.dispoDerniereMinuteOff')}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-1 px-1 text-xs" style={{ color: colors.DANGER }}>
          {error}
        </p>
      )}
    </div>
  );
}
