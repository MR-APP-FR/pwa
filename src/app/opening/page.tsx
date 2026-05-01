'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense, useTransition } from 'react';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { OpeningFormData } from '../../types/form.types';
import { WEEK_YEAR, WEEK_MONTH } from '../../constants/mock';
import { submitOpeningForm } from './actions';

function parseNumber(value: string): number | null {
  const trimmed = value.replace(',', '.').trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function OpeningContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });
  const { data: currentUser } = useCurrentUser();

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

  const [form, setForm] = useState<OpeningFormData>({
    missionId,
    feuilleDuJour: null,
    ticketsOuverture: null,
    fondDeCaisse100: true,
    observations: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setSubmitError(null);

    if (!mission) {
      setSubmitError("Mission introuvable.");
      return;
    }
    if (!currentUser?.user) {
      setSubmitError('Aucun employé sélectionné. Choisis un profil dans le header.');
      return;
    }
    if (form.feuilleDuJour === null) {
      setSubmitError('Renseigne le nombre de feuilles de jour.');
      return;
    }
    if (form.ticketsOuverture === null) {
      setSubmitError("Renseigne le nombre de tickets à l'ouverture.");
      return;
    }

    const fd = new FormData();
    fd.set('siteId', String(mission.site_id));
    fd.set('userId', String(currentUser.user.id));
    fd.set('date', `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`);
    fd.set('feuillesDeJour', String(form.feuilleDuJour));
    fd.set('ticketsOuverture', String(form.ticketsOuverture));
    fd.set('fondCaisse100', form.fondDeCaisse100 ? '1' : '0');
    fd.set('observations', form.observations);

    startTransition(async () => {
      const result = await submitOpeningForm(fd);
      if (result.ok) {
        setSubmitted(true);
      } else {
        setSubmitError(result.error);
      }
    });
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
              type="number"
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, feuilleDuJour: parseNumber(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ color: colors.TEXT_PRIMARY, borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY }}
            />
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

        {submitError && (
          <div
            className="rounded-xl border px-3 py-2 text-xs"
            style={{ borderColor: '#EB5757', color: '#EB5757', backgroundColor: '#EB575710' }}
          >
            {submitError}
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t" style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="w-full py-4 rounded-2xl text-base font-bold disabled:opacity-60"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          {pending ? '...' : t('forms.opening.submit')}
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
