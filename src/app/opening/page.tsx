'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { OpeningFormData } from '../../types/form.types';
import { WEEK_YEAR, WEEK_MONTH } from '../../constants/mock';

const FEUILLES_JOUR_REGEX = /^\d+(\/\d+)?$/;

function parseNumber(value: string): number | null {
  const trimmed = value.replace(',', '.').trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function OpeningContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

  const [form, setForm] = useState<OpeningFormData>({
    missionId,
    feuilleDuJour: '',
    ticketsOuverture: null,
    fondDeCaisse100: true,
    observations: '',
  });
  const [feuilleError, setFeuilleError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmitOpening() {
    const raw = form.feuilleDuJour.trim();
    if (raw.length === 0) {
      setFeuilleError(t('forms.opening.feuillesRequired'));
      return;
    }
    if (!FEUILLES_JOUR_REGEX.test(raw)) {
      setFeuilleError(t('forms.opening.feuillesFormatError'));
      return;
    }
    setFeuilleError(null);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <span className="text-6xl mb-2">&#x2705;</span>
        <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
          {t('forms.opening.successTitle')}
        </h2>
        <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
          {t('forms.opening.successDescription')}
        </p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-6 py-3 rounded-2xl text-base font-bold"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          Retour au planning
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {mission && (
          <div className="rounded-2xl border px-5 py-4" style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}>
            <p className="text-lg font-bold" style={{ color: colors.TEXT_PRIMARY }}>{mission.site_name}</p>
            <p className="text-sm mt-1" style={{ color: colors.TEXT_SECONDARY }}>{`${mission.day}/${mission.month}/${mission.year}`}</p>
          </div>
        )}

        <div className="rounded-2xl border px-5 py-5 space-y-5" style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}>
          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t('forms.opening.feuilleDuJour')}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('forms.opening.feuillePlaceholder')}
              value={form.feuilleDuJour}
              onChange={(e) => {
                setFeuilleError(null);
                setForm((f) => ({ ...f, feuilleDuJour: e.target.value }));
              }}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                color: colors.TEXT_PRIMARY,
                borderColor: feuilleError ? '#EB5757' : colors.BORDER,
                backgroundColor: colors.BG_SECONDARY,
              }}
            />
            {feuilleError && (
              <p className="text-xs font-medium" style={{ color: '#EB5757' }}>
                {feuilleError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t('forms.opening.ticketsOuverture')}</label>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, ticketsOuverture: parseNumber(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ color: colors.TEXT_PRIMARY, borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t('forms.opening.fondDeCaisse')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setForm((f) => ({ ...f, fondDeCaisse100: true }))}
                className="flex-1 py-2 rounded-lg border text-sm font-semibold"
                style={{
                  borderColor: form.fondDeCaisse100 ? colors.PRIMARY : colors.BORDER,
                  backgroundColor: form.fondDeCaisse100 ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
                  color: form.fondDeCaisse100 ? colors.PRIMARY : colors.TEXT_PRIMARY,
                }}
              >
                {t('forms.opening.fondDeCaisseYes')}
              </button>
              <button
                onClick={() => setForm((f) => ({ ...f, fondDeCaisse100: false }))}
                className="flex-1 py-2 rounded-lg border text-sm font-semibold"
                style={{
                  borderColor: !form.fondDeCaisse100 ? colors.PRIMARY : colors.BORDER,
                  backgroundColor: !form.fondDeCaisse100 ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
                  color: !form.fondDeCaisse100 ? colors.PRIMARY : colors.TEXT_PRIMARY,
                }}
              >
                {t('forms.opening.fondDeCaisseNo')}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t('forms.opening.observations')}</label>
            <textarea
              placeholder={t('forms.opening.observationsPlaceholder')}
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ color: colors.TEXT_PRIMARY, borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY }}
            />
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t" style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}>
        <button
          type="button"
          onClick={handleSubmitOpening}
          className="w-full py-4 rounded-2xl text-base font-bold"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          {t('forms.opening.submit')}
        </button>
      </div>
    </div>
  );
}

export default function OpeningPage() {
  return (
    <Suspense>
      <OpeningContent />
    </Suspense>
  );
}
