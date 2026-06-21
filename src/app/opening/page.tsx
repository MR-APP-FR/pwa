'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, Suspense, useTransition } from 'react';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useSiteDailyInfoQuestions } from '../../hooks/api/useSiteDailyInfoQuestions';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { ConditionalQuestion } from '../../components/forms/ConditionalQuestion';
import { FormNumberInput } from '../../components/forms/FormNumberInput';
import { FormSection } from '../../components/forms/FormSection';
import { PannesSection, buildPannesDetail, type SujetReasons } from '../../components/forms/PannesSection';
import { useSujets } from '../../hooks/api/useSujets';
import type { OpeningFormData } from '../../types/form.types';
import { useDemoDate } from '../../hooks/useDemoDate';
import { submitOpeningForm } from './actions';
import { submitDailyInfo } from '../../lib/actions/daily-info';
import { formatMissionDate } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { RADIUS } from '../../constants/design';

type OpeningFieldError =
  | 'feuilleDuJour'
  | 'ticketsOuverture'
  | 'fondDeCaisse100'
  | 'fondDeCaisse100Justification'
  | 'nettoyageVeille'
  | 'nettoyageVeilleJustification'
  | 'carteParkingJustification'
  | 'musiqueDisneyJustification';

function needsNoJustification(value: boolean | null, justification: string): boolean {
  return value === false && justification.trim().length === 0;
}

function buildObservationsWithJustifications(
  base: string,
  items: { label: string; value: boolean | null; justification: string }[],
): string {
  const parts: string[] = [];
  const trimmedBase = base.trim();
  if (trimmedBase.length > 0) parts.push(trimmedBase);
  for (const { label, value, justification } of items) {
    if (value === false && justification.trim().length > 0) {
      parts.push(`${label} (Non) : ${justification.trim()}`);
    }
  }
  return parts.join('\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function OpeningContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { weekYear, weekMonth } = useDemoDate();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const { data: currentUser } = useCurrentUser();

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

  const { data: sujets } = useSujets(mission?.site_id);
  const { data: questions } = useSiteDailyInfoQuestions(mission?.site_id);
  const showCarteParking = useMemo(() => questions?.includes('carte_parking') ?? false, [questions]);
  const showMusiqueDisney = useMemo(() => questions?.includes('musique_disney') ?? false, [questions]);

  const [form, setForm] = useState<OpeningFormData>({
    missionId,
    feuilleDuJour: null,
    ticketsOuverture: null,
    fondDeCaisse100: null,
    observations: '',
  });

  const [nettoyageVeille, setNettoyageVeille] = useState<boolean | null>(null);
  const [fondDeCaisseJustification, setFondDeCaisseJustification] = useState('');
  const [nettoyageVeilleJustification, setNettoyageVeilleJustification] = useState('');
  const [selectedSujetIds, setSelectedSujetIds] = useState<number[]>([]);
  const [sujetReasons, setSujetReasons] = useState<SujetReasons>({});
  const [carteParking, setCarteParking] = useState<boolean | null>(null);
  const [carteParkingJustification, setCarteParkingJustification] = useState('');
  const [musiqueDisney, setMusiqueDisney] = useState<boolean | null>(null);
  const [musiqueDisneyJustification, setMusiqueDisneyJustification] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<OpeningFieldError | null>(null);
  const [pending, startTransition] = useTransition();

  const isFormValid =
    form.feuilleDuJour !== null &&
    form.ticketsOuverture !== null &&
    form.fondDeCaisse100 !== null &&
    !needsNoJustification(form.fondDeCaisse100, fondDeCaisseJustification) &&
    nettoyageVeille !== null &&
    !needsNoJustification(nettoyageVeille, nettoyageVeilleJustification) &&
    (!showCarteParking ||
      (carteParking !== null && !needsNoJustification(carteParking, carteParkingJustification))) &&
    (!showMusiqueDisney ||
      (musiqueDisney !== null && !needsNoJustification(musiqueDisney, musiqueDisneyJustification)));

  function getFirstMissingField(): OpeningFieldError | null {
    if (form.feuilleDuJour === null) return 'feuilleDuJour';
    if (form.ticketsOuverture === null) return 'ticketsOuverture';
    if (form.fondDeCaisse100 === null) return 'fondDeCaisse100';
    if (needsNoJustification(form.fondDeCaisse100, fondDeCaisseJustification)) {
      return 'fondDeCaisse100Justification';
    }
    if (nettoyageVeille === null) return 'nettoyageVeille';
    if (needsNoJustification(nettoyageVeille, nettoyageVeilleJustification)) {
      return 'nettoyageVeilleJustification';
    }
    if (showCarteParking && needsNoJustification(carteParking, carteParkingJustification)) {
      return 'carteParkingJustification';
    }
    if (showMusiqueDisney && needsNoJustification(musiqueDisney, musiqueDisneyJustification)) {
      return 'musiqueDisneyJustification';
    }
    return null;
  }

  function errorMessageForField(field: OpeningFieldError): string {
    switch (field) {
      case 'feuilleDuJour':
        return t('forms.opening.errorFeuilleDuJour');
      case 'ticketsOuverture':
        return t('forms.opening.errorTicketsOuverture');
      case 'fondDeCaisse100':
        return t('forms.opening.errorFondDeCaisse');
      case 'fondDeCaisse100Justification':
      case 'nettoyageVeilleJustification':
      case 'carteParkingJustification':
      case 'musiqueDisneyJustification':
        return t('forms.common.errorNoJustification');
      case 'nettoyageVeille':
        return t('forms.opening.errorNettoyageVeille');
    }
  }

  function handleSubmit() {
    setSubmitError(null);

    if (!mission) {
      setSubmitError('Mission introuvable.');
      return;
    }
    if (!currentUser?.user) {
      setSubmitError('Aucun employé sélectionné. Choisis un profil dans le header.');
      return;
    }

    const missing = getFirstMissingField();
    if (missing) {
      setFieldError(missing);
      setSubmitError(errorMessageForField(missing));
      return;
    }

    setFieldError(null);

    const fd = new FormData();
    fd.set('siteId', String(mission.site_id));
    fd.set('userId', String(currentUser.user.id));
    fd.set('date', `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`);
    fd.set('feuillesDeJour', String(form.feuilleDuJour));
    fd.set('ticketsOuverture', String(form.ticketsOuverture));
    fd.set('fondCaisse100', form.fondDeCaisse100 ? '1' : '0');
    fd.set(
      'observations',
      buildObservationsWithJustifications(form.observations, [
        { label: t('forms.opening.fondDeCaisse'), value: form.fondDeCaisse100, justification: fondDeCaisseJustification },
        { label: t('forms.dailyInfo.nettoyageVeille'), value: nettoyageVeille, justification: nettoyageVeilleJustification },
        ...(showCarteParking
          ? [{ label: t('forms.dailyInfo.carteParking'), value: carteParking, justification: carteParkingJustification }]
          : []),
        ...(showMusiqueDisney
          ? [{ label: t('forms.dailyInfo.musiqueDisney'), value: musiqueDisney, justification: musiqueDisneyJustification }]
          : []),
      ]),
    );

    const date = `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`;

    startTransition(async () => {
      const result = await submitOpeningForm(fd);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      const dailyResult = await submitDailyInfo({
        siteId: mission.site_id,
        userId: currentUser.user.id,
        date,
        nettoyageVeille,
        panneSujetIds: selectedSujetIds,
        pannesAutre: null,
        pannes: buildPannesDetail(selectedSujetIds, sujetReasons, sujets ?? []),
        carteParking: showCarteParking ? carteParking : null,
        musiqueDisney: showMusiqueDisney ? musiqueDisney : null,
      });

      if (!dailyResult.ok) {
        setSubmitError(dailyResult.error);
        return;
      }

      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <FormScrollLayout>
        <div
          className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6"
          style={{ backgroundColor: colors.BG_SECONDARY }}
        >
          <span className="text-6xl mb-2">&#x2705;</span>
          <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
            {t('forms.opening.successTitle')}
          </h2>
          <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.opening.successDescription')}
          </p>
          <PrimaryButton onClick={() => router.back()} className="mt-4 px-6 py-3 text-base">
            Retour au planning
          </PrimaryButton>
        </div>
      </FormScrollLayout>
    );
  }

  return (
    <FormScrollLayout
      footer={
        <div className="px-5 py-4" style={{ backgroundColor: colors.BG_SECONDARY }}>
          <PrimaryButton
            onClick={handleSubmit}
            disabled={pending || !isFormValid}
            className="w-full py-4 text-base"
          >
            {pending ? '...' : t('forms.opening.submit')}
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            title={t('forms.opening.title')}
            subtitle={mission?.site_name}
            detail={
              mission
                ? formatMissionDate(mission.year, mission.month, mission.day)
                : undefined
            }
            showBack
          />
        </FormPinnedPageHeader>
        <div className="space-y-4 px-5 py-5">
        <div className="card-surface space-y-5 px-5 py-5">
          <FormSection title={t('forms.opening.sectionCounts')}>
            <FormNumberInput
              label={t('forms.opening.feuilleDuJour')}
              value={form.feuilleDuJour}
              onChange={(v) => {
                setForm((f) => ({ ...f, feuilleDuJour: v }));
                if (fieldError === 'feuilleDuJour') setFieldError(null);
              }}
              unit="count"
              required
              error={fieldError === 'feuilleDuJour'}
              inputMode="numeric"
            />
            <FormNumberInput
              label={t('forms.opening.ticketsOuverture')}
              value={form.ticketsOuverture}
              onChange={(v) => {
                setForm((f) => ({ ...f, ticketsOuverture: v }));
                if (fieldError === 'ticketsOuverture') setFieldError(null);
              }}
              unit="count"
              required
              error={fieldError === 'ticketsOuverture'}
              inputMode="numeric"
            />
          </FormSection>

          <FormSection title={t('forms.opening.sectionChecks')}>
            <ConditionalQuestion
              label={t('forms.opening.fondDeCaisse')}
              value={form.fondDeCaisse100}
              onChange={(v) => {
                setForm((f) => ({ ...f, fondDeCaisse100: v }));
                if (v) setFondDeCaisseJustification('');
                if (fieldError === 'fondDeCaisse100' || fieldError === 'fondDeCaisse100Justification') {
                  setFieldError(null);
                }
              }}
              yesLabel={t('forms.opening.fondDeCaisseYes')}
              noLabel={t('forms.opening.fondDeCaisseNo')}
              required
              error={fieldError === 'fondDeCaisse100'}
              noJustification={fondDeCaisseJustification}
              onNoJustificationChange={(v) => {
                setFondDeCaisseJustification(v);
                if (fieldError === 'fondDeCaisse100Justification') setFieldError(null);
              }}
              noJustificationPlaceholder={t('forms.common.noJustificationPlaceholder')}
              noJustificationError={fieldError === 'fondDeCaisse100Justification'}
            />

            <ConditionalQuestion
              label={t('forms.dailyInfo.nettoyageVeille')}
              value={nettoyageVeille}
              onChange={(v) => {
                setNettoyageVeille(v);
                if (v) setNettoyageVeilleJustification('');
                if (fieldError === 'nettoyageVeille' || fieldError === 'nettoyageVeilleJustification') {
                  setFieldError(null);
                }
              }}
              yesLabel={t('forms.opening.fondDeCaisseYes')}
              noLabel={t('forms.opening.fondDeCaisseNo')}
              required
              error={fieldError === 'nettoyageVeille'}
              noJustification={nettoyageVeilleJustification}
              onNoJustificationChange={(v) => {
                setNettoyageVeilleJustification(v);
                if (fieldError === 'nettoyageVeilleJustification') setFieldError(null);
              }}
              noJustificationPlaceholder={t('forms.common.noJustificationPlaceholder')}
              noJustificationError={fieldError === 'nettoyageVeilleJustification'}
            />
          </FormSection>

          <FormSection title={t('forms.opening.sectionPannes')}>
            <PannesSection
              siteId={mission?.site_id}
              selectedSujetIds={selectedSujetIds}
              onToggleSujet={(id) =>
                setSelectedSujetIds((prev) =>
                  prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
                )
              }
              sujetReasons={sujetReasons}
              onSujetReasonChange={(id, reason) =>
                setSujetReasons((prev) => ({ ...prev, [id]: reason }))
              }
              onClearPannes={() => {
                setSelectedSujetIds([]);
                setSujetReasons({});
              }}
            />

            {showCarteParking && (
              <ConditionalQuestion
                label={t('forms.dailyInfo.carteParking')}
                value={carteParking}
                onChange={(v) => {
                  setCarteParking(v);
                  if (v) setCarteParkingJustification('');
                  if (fieldError === 'carteParkingJustification') setFieldError(null);
                }}
                yesLabel={t('forms.opening.fondDeCaisseYes')}
                noLabel={t('forms.opening.fondDeCaisseNo')}
                noJustification={carteParkingJustification}
                onNoJustificationChange={(v) => {
                  setCarteParkingJustification(v);
                  if (fieldError === 'carteParkingJustification') setFieldError(null);
                }}
                noJustificationPlaceholder={t('forms.common.noJustificationPlaceholder')}
                noJustificationError={fieldError === 'carteParkingJustification'}
              />
            )}

            {showMusiqueDisney && (
              <ConditionalQuestion
                label={t('forms.dailyInfo.musiqueDisney')}
                value={musiqueDisney}
                onChange={(v) => {
                  setMusiqueDisney(v);
                  if (v) setMusiqueDisneyJustification('');
                  if (fieldError === 'musiqueDisneyJustification') setFieldError(null);
                }}
                yesLabel={t('forms.opening.fondDeCaisseYes')}
                noLabel={t('forms.opening.fondDeCaisseNo')}
                noJustification={musiqueDisneyJustification}
                onNoJustificationChange={(v) => {
                  setMusiqueDisneyJustification(v);
                  if (fieldError === 'musiqueDisneyJustification') setFieldError(null);
                }}
                noJustificationPlaceholder={t('forms.common.noJustificationPlaceholder')}
                noJustificationError={fieldError === 'musiqueDisneyJustification'}
              />
            )}
          </FormSection>

          <FormSection
            title={t('forms.opening.sectionNotes')}
            optional
            optionalLabel={t('forms.common.optional')}
          >
            <div className="space-y-1.5">
              <textarea
                placeholder={t('forms.opening.observationsPlaceholder')}
                value={form.observations}
                onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                rows={3}
                className="min-h-[80px] w-full resize-none rounded-xl border px-3 py-3 text-base"
                style={{
                  color: colors.TEXT_PRIMARY,
                  borderColor: colors.BORDER,
                  backgroundColor: colors.BG_SECONDARY,
                  borderRadius: RADIUS.sm,
                }}
              />
            </div>
          </FormSection>
        </div>

        {submitError && (
          <div
            className="rounded-xl border px-3 py-2.5 text-sm"
            style={{ borderColor: colors.DANGER, color: colors.DANGER, backgroundColor: colors.ACCENT_RED_MUTED }}
          >
            {submitError}
          </div>
        )}
        </div>
      </div>
    </FormScrollLayout>
  );
}

export default function OpeningPage() {
  return (
    <Suspense>
      <OpeningContent />
    </Suspense>
  );
}
