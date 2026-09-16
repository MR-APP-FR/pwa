'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, Suspense, useTransition, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useSiteDailyInfoQuestions } from '../../hooks/api/useSiteDailyInfoQuestions';
import {
  DEFAULT_FOND_CAISSE_EUROS,
  useSiteTerrainConfig,
} from '../../hooks/api/useSiteTerrainConfig';
import { useExistingOpeningForm } from '../../hooks/api/useExistingOpeningForm';
import { useTelecollecteSignedUrl } from '../../hooks/api/useTelecollecteSignedUrl';
import { dateIsoToJourSemaineKey } from '../../lib/parisTime';
import { CHRONO_WEEKDAY_KEY, isChronoInExpectedRange } from './chrono';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { ConditionalQuestion } from '../../components/forms/ConditionalQuestion';
import { PhotoCaptureField, type CapturedPhoto } from '../../components/forms/PhotoCaptureField';
import { FormNumberInput } from '../../components/forms/FormNumberInput';
import { FormDurationInput, type DurationValue } from '../../components/forms/FormDurationInput';
import { FormSection } from '../../components/forms/FormSection';
import { FormLockedBanner } from '../../components/forms/FormLockedBanner';
import { LockedPhotoThumb } from '../../components/forms/LockedPhotoThumb';
import { PannesSection, buildPannesDetail, type SujetReasons } from '../../components/forms/PannesSection';
import {
  OpenPannesCheckin,
  allPanneCheckinsAnswered,
  excludedSujetIdsFromStillOpen,
  openPanneTicketHeadline,
  resolvedInterventionIds,
  shouldExcludeAutrePanne,
} from '../../components/forms/OpenPannesCheckin';
import {
  MondayOpeningChecks,
  areMondayChecksComplete,
  buildMondayPayload,
  emptyAffairesState,
  emptyPanneauxState,
  type AffaireKey,
  type AffairesState,
  type PanneauKey,
  type PanneauxState,
  AFFAIRES_KEYS,
  PANNEAUX_COLLES_KEYS,
  PANNEAUX_VOLANTS_KEYS,
} from '../../components/forms/MondayOpeningChecks';
import { useSujets } from '../../hooks/api/useSujets';
import { useOpenSiteInterventions } from '../../hooks/api/useOpenSiteInterventions';
import type { PanneCheckinAnswer } from '../../database/types/intervention.types';
import type { OpeningFormData } from '../../types/form.types';
import { useAppDate } from '../../hooks/useAppDate';
import { resolvePannesFromOpening, submitOpeningForm } from './actions';
import { submitDailyInfo } from '../../lib/actions/daily-info';
import { isBrowserOffline } from '../../lib/offline';
import { requestGeolocation } from '../../lib/geolocation';
import { formatMissionDate } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { PageSectionTitle } from '../../components/layout/PageSectionTitle';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { FormMissingFieldsHint } from '../../components/forms/FormMissingFieldsHint';
import { RADIUS } from '../../constants/design';

type OpeningFieldError =
  | 'feuilleDuJour'
  | 'ticketsOuverture'
  | 'chrono'
  | 'fondDeCaisse100'
  | 'fondDeCaisse100Justification'
  | 'nettoyageVeille'
  | 'nettoyageVeilleJustification'
  | 'carteParking'
  | 'musiqueDisneyJustification'
  | 'panneCheckin';

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

function durationToSeconds(value: DurationValue): number | null {
  if (value.minutes === null || value.seconds === null) return null;
  return value.minutes * 60 + value.seconds;
}

function OpeningContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { weekYear, weekMonth } = useAppDate();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const { data: currentUser } = useCurrentUser();

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

  const missionDateIso = useMemo(() => {
    if (!mission) return null;
    return `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`;
  }, [mission]);

  const { data: sujets } = useSujets(mission?.site_id);
  const { data: openInterventions } = useOpenSiteInterventions(mission?.site_id, missionDateIso);
  const openTickets = openInterventions ?? [];
  const { data: questions } = useSiteDailyInfoQuestions(mission?.site_id);
  const { data: terrainConfig } = useSiteTerrainConfig(mission?.site_id);
  const fondCaisseEuros = terrainConfig?.fondCaisseEuros ?? DEFAULT_FOND_CAISSE_EUROS;
  const fondDeCaisseLabel = t('forms.opening.fondDeCaisse', {
    amount: String(fondCaisseEuros),
  });
  const { data: existingOpening, isLoading: existingOpeningLoading } = useExistingOpeningForm(
    mission?.site_id,
    missionDateIso,
  );
  const isLocked = existingOpening != null;
  const hydratedRef = useRef(false);
  const nettoyageSigned = useTelecollecteSignedUrl(
    isLocked ? existingOpening?.dailyInfo?.photo_nettoyage_url : null,
  );
  const showCarteParking = terrainConfig?.carteParkingEnabled === true;
  const carteParkingLabel =
    terrainConfig?.questionParkingLabel ?? t('forms.opening.carteParkingCaisse');
  const showMusiqueDisney = useMemo(() => questions?.includes('musique_disney') ?? false, [questions]);
  const showChrono = useMemo(
    () => (missionDateIso ? dateIsoToJourSemaineKey(missionDateIso) === CHRONO_WEEKDAY_KEY : false),
    [missionDateIso],
  );

  const [form, setForm] = useState<OpeningFormData>({
    missionId,
    feuilleDuJour: null,
    ticketsOuverture: null,
    fondDeCaisse100: null,
    observations: '',
  });

  const [nettoyageVeille, setNettoyageVeille] = useState<boolean | null>(null);
  const [nettoyagePhoto, setNettoyagePhoto] = useState<CapturedPhoto | null>(null);
  const [fondDeCaisseJustification, setFondDeCaisseJustification] = useState('');
  const [nettoyageVeilleJustification, setNettoyageVeilleJustification] = useState('');
  const [selectedSujetIds, setSelectedSujetIds] = useState<number[]>([]);
  const [sujetReasons, setSujetReasons] = useState<SujetReasons>({});
  const [pannesAutre, setPannesAutre] = useState('');
  const [panneCheckinAnswers, setPanneCheckinAnswers] = useState<
    Record<number, PanneCheckinAnswer | undefined>
  >({});
  const [carteParking, setCarteParking] = useState<boolean | null>(null);
  const [musiqueDisney, setMusiqueDisney] = useState<boolean | null>(null);
  const [musiqueDisneyJustification, setMusiqueDisneyJustification] = useState('');
  const [chrono, setChrono] = useState<DurationValue>({ minutes: 0, seconds: 0 });
  const [chronoOutOfRangeAttempts, setChronoOutOfRangeAttempts] = useState(0);
  const [panneaux, setPanneaux] = useState<PanneauxState>(() => emptyPanneauxState());
  const [affaires, setAffaires] = useState<AffairesState>(() => emptyAffairesState());
  const [missingOpen, setMissingOpen] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<OpeningFieldError | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void requestGeolocation();
  }, []);

  useEffect(() => {
    if (!existingOpening || hydratedRef.current) return;
    hydratedRef.current = true;
    const { opening, dailyInfo } = existingOpening;

    const feuilleRaw = Number(opening.feuilles_de_jour);
    setForm({
      missionId,
      feuilleDuJour: Number.isFinite(feuilleRaw) ? feuilleRaw : null,
      ticketsOuverture: opening.tickets_ouverture,
      fondDeCaisse100: opening.fond_caisse_100,
      observations: opening.observations ?? '',
    });

    if (opening.chrono_seconds != null && Number.isFinite(opening.chrono_seconds)) {
      const s = Math.max(0, Math.floor(opening.chrono_seconds));
      setChrono({ minutes: Math.floor(s / 60), seconds: s % 60 });
    }

    if (opening.panneaux) {
      const next = emptyPanneauxState();
      for (const key of [...PANNEAUX_COLLES_KEYS, ...PANNEAUX_VOLANTS_KEYS]) {
        if (key in opening.panneaux) {
          next[key] = opening.panneaux[key] === true;
        }
      }
      setPanneaux(next);
    }

    if (opening.affaires) {
      const next = emptyAffairesState();
      for (const key of AFFAIRES_KEYS) {
        const item = opening.affaires[key];
        if (!item) continue;
        next[key] = {
          present: item.present === true,
          reste: item.reste != null && Number.isFinite(item.reste) ? String(item.reste) : '',
        };
      }
      setAffaires(next);
    }

    if (dailyInfo) {
      setNettoyageVeille(dailyInfo.nettoyage_veille);
      setCarteParking(dailyInfo.carte_parking);
      setMusiqueDisney(dailyInfo.musique_disney);
      setPannesAutre(dailyInfo.pannes_autre ?? '');
      setSelectedSujetIds(dailyInfo.pannes_sujet_ids ?? []);
    }
  }, [existingOpening, missionId]);

  const isFormValid =
    form.feuilleDuJour !== null &&
    form.ticketsOuverture !== null &&
    (!showChrono || durationToSeconds(chrono) !== null) &&
    (!showChrono || areMondayChecksComplete(panneaux, affaires)) &&
    form.fondDeCaisse100 !== null &&
    !needsNoJustification(form.fondDeCaisse100, fondDeCaisseJustification) &&
    nettoyageVeille !== null &&
    !needsNoJustification(nettoyageVeille, nettoyageVeilleJustification) &&
    (!showCarteParking || carteParking !== null) &&
    (!showMusiqueDisney ||
      (musiqueDisney !== null && !needsNoJustification(musiqueDisney, musiqueDisneyJustification))) &&
    allPanneCheckinsAnswered(openTickets, panneCheckinAnswers);

  const missingFieldLabels = useMemo(() => {
    const items: string[] = [];
    if (form.feuilleDuJour === null) items.push(t('forms.opening.feuilleDuJour'));
    if (form.ticketsOuverture === null) items.push(t('forms.opening.ticketsOuverture'));
    if (showChrono && durationToSeconds(chrono) === null) items.push(t('forms.opening.chrono'));
    if (form.fondDeCaisse100 === null) {
      items.push(fondDeCaisseLabel);
    } else if (needsNoJustification(form.fondDeCaisse100, fondDeCaisseJustification)) {
      items.push(t('forms.common.missingNoJustification', { field: fondDeCaisseLabel }));
    }
    if (nettoyageVeille === null) {
      items.push(t('forms.dailyInfo.nettoyageVeille'));
    } else if (needsNoJustification(nettoyageVeille, nettoyageVeilleJustification)) {
      items.push(
        t('forms.common.missingNoJustification', { field: t('forms.dailyInfo.nettoyageVeille') }),
      );
    }
    if (showCarteParking && carteParking === null) items.push(carteParkingLabel);
    if (showMusiqueDisney) {
      if (musiqueDisney === null) {
        items.push(t('forms.dailyInfo.musiqueDisney'));
      } else if (needsNoJustification(musiqueDisney, musiqueDisneyJustification)) {
        items.push(
          t('forms.common.missingNoJustification', { field: t('forms.dailyInfo.musiqueDisney') }),
        );
      }
    }
    for (const ticket of openTickets) {
      if (panneCheckinAnswers[ticket.id] == null) {
        items.push(
          t('forms.opening.panneCheckin.missingTicket', {
            label: openPanneTicketHeadline(ticket),
          }),
        );
      }
    }
    if (showChrono) {
      for (const key of Object.keys(panneaux) as PanneauKey[]) {
        if (panneaux[key] === null) {
          items.push(t(`forms.opening.panneaux.items.${key}`));
        }
      }
      for (const key of Object.keys(affaires) as AffaireKey[]) {
        const item = affaires[key];
        if (item.present === null) {
          items.push(t(`forms.opening.affaires.items.${key}`));
        } else if (item.present === false && item.reste.trim().length === 0) {
          items.push(
            t('forms.common.missingNoJustification', {
              field: t(`forms.opening.affaires.items.${key}`),
            }),
          );
        }
      }
    }
    return items;
  }, [
    form.feuilleDuJour,
    form.ticketsOuverture,
    showChrono,
    chrono,
    form.fondDeCaisse100,
    fondDeCaisseJustification,
    fondDeCaisseLabel,
    nettoyageVeille,
    nettoyageVeilleJustification,
    showCarteParking,
    carteParking,
    carteParkingLabel,
    showMusiqueDisney,
    musiqueDisney,
    musiqueDisneyJustification,
    openTickets,
    panneCheckinAnswers,
    panneaux,
    affaires,
    t,
  ]);

  function getFirstMissingField(): OpeningFieldError | null {
    if (form.feuilleDuJour === null) return 'feuilleDuJour';
    if (form.ticketsOuverture === null) return 'ticketsOuverture';
    if (showChrono && durationToSeconds(chrono) === null) return 'chrono';
    if (form.fondDeCaisse100 === null) return 'fondDeCaisse100';
    if (needsNoJustification(form.fondDeCaisse100, fondDeCaisseJustification)) {
      return 'fondDeCaisse100Justification';
    }
    if (nettoyageVeille === null) return 'nettoyageVeille';
    if (needsNoJustification(nettoyageVeille, nettoyageVeilleJustification)) {
      return 'nettoyageVeilleJustification';
    }
    if (showCarteParking && carteParking === null) return 'carteParking';
    if (showMusiqueDisney && needsNoJustification(musiqueDisney, musiqueDisneyJustification)) {
      return 'musiqueDisneyJustification';
    }
    if (!allPanneCheckinsAnswered(openTickets, panneCheckinAnswers)) {
      return 'panneCheckin';
    }
    return null;
  }

  function errorMessageForField(field: OpeningFieldError): string {
    switch (field) {
      case 'feuilleDuJour':
        return t('forms.opening.errorFeuilleDuJour');
      case 'ticketsOuverture':
        return t('forms.opening.errorTicketsOuverture');
      case 'chrono':
        return chronoOutOfRangeAttempts > 0
          ? t('forms.opening.chronoRetry')
          : t('forms.opening.errorChrono');
      case 'fondDeCaisse100':
        return t('forms.opening.errorFondDeCaisse');
      case 'fondDeCaisse100Justification':
      case 'nettoyageVeilleJustification':
      case 'carteParking':
        return t('forms.opening.errorCarteParking');
      case 'musiqueDisneyJustification':
        return t('forms.common.errorNoJustification');
      case 'nettoyageVeille':
        return t('forms.opening.errorNettoyageVeille');
      case 'panneCheckin':
        return t('forms.opening.panneCheckin.errorIncomplete');
    }
  }

  function handleSubmit() {
    setSubmitError(null);

    if (!mission) {
      setSubmitError('Mission introuvable.');
      return;
    }
    if (!currentUser?.user) {
      setSubmitError('Session invalide. Reconnecte-toi.');
      return;
    }
    if (isBrowserOffline()) {
      setSubmitError(t('forms.common.errorOffline'));
      return;
    }

    const missing = getFirstMissingField();
    if (missing) {
      setFieldError(missing);
      setSubmitError(errorMessageForField(missing));
      return;
    }

    setFieldError(null);

    let chronoSeconds: number | null = null;
    if (showChrono) {
      chronoSeconds = durationToSeconds(chrono);
      if (chronoSeconds !== null && !isChronoInExpectedRange(chronoSeconds)) {
        if (chronoOutOfRangeAttempts === 0) {
          setChronoOutOfRangeAttempts(1);
          setFieldError('chrono');
          setSubmitError(t('forms.opening.chronoRetry'));
          return;
        }
      }
    }

    const fd = new FormData();
    fd.set('siteId', String(mission.site_id));
    fd.set('date', `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`);
    fd.set('feuillesDeJour', String(form.feuilleDuJour));
    fd.set('ticketsOuverture', String(form.ticketsOuverture));
    if (showChrono && chronoSeconds !== null) {
      fd.set('chronoSeconds', String(chronoSeconds));
      if (!isChronoInExpectedRange(chronoSeconds)) {
        fd.set('chronoConfirmOutOfRange', '1');
      }
    }
    if (showChrono) {
      const monday = buildMondayPayload(panneaux, affaires);
      if (!monday) {
        setSubmitError(t('forms.opening.errorMondayChecks'));
        return;
      }
      fd.set('panneaux', JSON.stringify(monday.panneaux));
      fd.set('affaires', JSON.stringify(monday.affaires));
    }
    fd.set('fondCaisse100', form.fondDeCaisse100 ? '1' : '0');
    fd.set(
      'observations',
      buildObservationsWithJustifications(form.observations, [
        { label: fondDeCaisseLabel, value: form.fondDeCaisse100, justification: fondDeCaisseJustification },
        { label: t('forms.dailyInfo.nettoyageVeille'), value: nettoyageVeille, justification: nettoyageVeilleJustification },
        ...(showMusiqueDisney
          ? [{ label: t('forms.dailyInfo.musiqueDisney'), value: musiqueDisney, justification: musiqueDisneyJustification }]
          : []),
      ]),
    );

    const date = `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`;

    startTransition(async () => {
      try {
        const geo = await requestGeolocation();
        if (geo.ok) {
          fd.set('clientLat', String(geo.latitude));
          fd.set('clientLng', String(geo.longitude));
        }

        const result = await submitOpeningForm(fd);
        if (!result.ok) {
          if (result.code === 'chrono_retry') {
            setChronoOutOfRangeAttempts((n) => Math.max(n, 1));
            setFieldError('chrono');
            setSubmitError(t('forms.opening.chronoRetry'));
            return;
          }
          setSubmitError(result.error);
          return;
        }

        const resolvedIds = resolvedInterventionIds(openTickets, panneCheckinAnswers);
        if (resolvedIds.length > 0) {
          const resolveResult = await resolvePannesFromOpening(mission.site_id, date, resolvedIds);
          if (!resolveResult.ok) {
            setSubmitError(resolveResult.error);
            return;
          }
        }

        const excludedSujetIds = new Set(
          excludedSujetIdsFromStillOpen(openTickets, panneCheckinAnswers),
        );
        const filteredSujetIds = selectedSujetIds.filter((id) => !excludedSujetIds.has(id));
        const filteredSujetReasons = Object.fromEntries(
          Object.entries(sujetReasons).filter(([id]) => filteredSujetIds.includes(Number(id))),
        ) as SujetReasons;
        const excludeAutre = shouldExcludeAutrePanne(openTickets, panneCheckinAnswers);
        const filteredPannesAutre = excludeAutre ? null : pannesAutre.trim() || null;

        const dailyResult = await submitDailyInfo({
          siteId: mission.site_id,
          date,
          nettoyageVeille,
          panneSujetIds: filteredSujetIds,
          pannesAutre: filteredPannesAutre,
          pannes: buildPannesDetail(filteredSujetIds, filteredSujetReasons, sujets ?? []),
          carteParking: showCarteParking ? carteParking : null,
          musiqueDisney: showMusiqueDisney ? musiqueDisney : null,
          nettoyagePhoto: nettoyagePhoto?.file ?? null,
          nettoyagePhotoSource: nettoyagePhoto?.source ?? null,
          nettoyagePhotoCapturedAtMs: nettoyagePhoto?.capturedAtMs ?? null,
        });

        if (!dailyResult.ok) {
          setSubmitError(dailyResult.error);
          return;
        }

        queryClient.invalidateQueries({ queryKey: ['missionForms'] });
        queryClient.invalidateQueries({ queryKey: ['openSiteInterventions'] });
        queryClient.invalidateQueries({ queryKey: ['existingOpeningForm'] });
        setSubmitted(true);
      } catch {
        setSubmitError(t('forms.common.errorSubmit'));
      }
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

  if (existingOpeningLoading && !existingOpening) {
    return (
      <FormScrollLayout>
        <div
          className="flex min-h-[40vh] items-center justify-center"
          style={{ backgroundColor: colors.BG_SECONDARY }}
        >
          <p style={{ color: colors.TEXT_SECONDARY }}>...</p>
        </div>
      </FormScrollLayout>
    );
  }

  return (
    <FormScrollLayout
      footer={
        <div className="px-5 py-4" style={{ backgroundColor: colors.BG_SECONDARY }}>
          {isLocked ? (
            <PrimaryButton onClick={() => router.back()} className="w-full py-4 text-base">
              Retour
            </PrimaryButton>
          ) : (
            <>
              <FormMissingFieldsHint
                items={missingFieldLabels}
                open={missingOpen}
                onClose={() => setMissingOpen(false)}
              />
              <PrimaryButton
                onClick={() => {
                  if (!isFormValid) {
                    setMissingOpen(true);
                    return;
                  }
                  handleSubmit();
                }}
                disabled={pending}
                aria-disabled={!isFormValid || pending}
                className={`w-full py-4 text-base${!isFormValid && !pending ? ' opacity-45' : ''}`}
              >
                {pending ? '...' : t('forms.opening.submit')}
              </PrimaryButton>
            </>
          )}
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="green"
            title={t('forms.opening.title')}
            showBack
          />
        </FormPinnedPageHeader>
        {mission && (
          <PageSectionTitle
            title={mission.site_name}
            detail={formatMissionDate(mission.year, mission.month, mission.day)}
          />
        )}
        <div className="space-y-4 px-5 pb-5 pt-3">
        {isLocked && <FormLockedBanner label={t('forms.opening.lockedBanner')} />}
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
              readOnly={isLocked}
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
              readOnly={isLocked}
            />
          </FormSection>

          <FormSection title={t('forms.opening.sectionChecks')}>
            <ConditionalQuestion
              label={fondDeCaisseLabel}
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
              disabled={isLocked}
            />

            <ConditionalQuestion
              label={t('forms.dailyInfo.nettoyageVeille')}
              value={nettoyageVeille}
              onChange={(v) => {
                setNettoyageVeille(v);
                if (v) {
                  setNettoyageVeilleJustification('');
                  setNettoyagePhoto(null);
                }
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
              disabled={isLocked}
            />
            {nettoyageVeille === false &&
              (isLocked ? (
                <LockedPhotoThumb
                  label={t('forms.common.photoNettoyage')}
                  signedUrl={nettoyageSigned.data ?? null}
                  source={existingOpening?.dailyInfo?.photo_source ?? null}
                  capturedAtIso={existingOpening?.dailyInfo?.photo_captured_at ?? null}
                />
              ) : (
                <PhotoCaptureField
                  label={t('forms.common.photoNettoyage')}
                  value={nettoyagePhoto}
                  onChange={setNettoyagePhoto}
                />
              ))}

            {showCarteParking && (
              <ConditionalQuestion
                label={carteParkingLabel}
                value={carteParking}
                onChange={(v) => {
                  setCarteParking(v);
                  if (fieldError === 'carteParking') setFieldError(null);
                }}
                yesLabel={t('forms.opening.fondDeCaisseYes')}
                noLabel={t('forms.opening.fondDeCaisseNo')}
                required
                error={fieldError === 'carteParking'}
                disabled={isLocked}
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
                disabled={isLocked}
              />
            )}
          </FormSection>

          <FormSection title={t('forms.opening.sectionPannes')}>
            {isLocked ? (
              <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                —
              </p>
            ) : (
              <>
                {openTickets.length > 0 && (
                  <div className="space-y-3">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: colors.TEXT_SECONDARY, fontFamily: 'var(--font-display)' }}
                    >
                      {t('forms.opening.sectionPannesVerification')}
                    </p>
                    <OpenPannesCheckin
                      tickets={openTickets}
                      answers={panneCheckinAnswers}
                      onAnswer={(ticketId, answer) => {
                        setPanneCheckinAnswers((prev) => ({ ...prev, [ticketId]: answer }));
                        if (fieldError === 'panneCheckin') setFieldError(null);
                      }}
                      error={fieldError === 'panneCheckin'}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: colors.TEXT_SECONDARY, fontFamily: 'var(--font-display)' }}
                  >
                    {t('forms.opening.sectionPannesSujets')}
                  </p>
                  <PannesSection
                    variant="sujets"
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
                    pannesAutre={pannesAutre}
                    onPannesAutreChange={setPannesAutre}
                    onClearPannes={() => {
                      setSelectedSujetIds([]);
                      setSujetReasons({});
                      setPannesAutre('');
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: colors.TEXT_SECONDARY, fontFamily: 'var(--font-display)' }}
                  >
                    {t('forms.opening.sectionPannesAutres')}
                  </p>
                  <PannesSection
                    variant="autre"
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
                    pannesAutre={pannesAutre}
                    onPannesAutreChange={setPannesAutre}
                    onClearPannes={() => {
                      setSelectedSujetIds([]);
                      setSujetReasons({});
                      setPannesAutre('');
                    }}
                  />
                </div>
              </>
            )}
          </FormSection>

          {showChrono && (
            <>
              <FormSection title={t('forms.opening.sectionPanneaux')}>
                <MondayOpeningChecks
                  mode="panneaux"
                  panneaux={panneaux}
                  onPanneauChange={(key, value) => {
                    setPanneaux((prev) => ({ ...prev, [key]: value }));
                  }}
                  affaires={affaires}
                  onAffairePresentChange={(key, value) => {
                    setAffaires((prev) => ({
                      ...prev,
                      [key]: {
                        present: value,
                        reste: value ? '' : prev[key].reste,
                      },
                    }));
                  }}
                  onAffaireResteChange={(key, value) => {
                    setAffaires((prev) => ({
                      ...prev,
                      [key]: { ...prev[key], reste: value },
                    }));
                  }}
                  disabled={isLocked}
                />
              </FormSection>
              <FormSection title={t('forms.opening.sectionAffaires')}>
                <MondayOpeningChecks
                  mode="affaires"
                  panneaux={panneaux}
                  onPanneauChange={(key, value) => {
                    setPanneaux((prev) => ({ ...prev, [key]: value }));
                  }}
                  affaires={affaires}
                  onAffairePresentChange={(key, value) => {
                    setAffaires((prev) => ({
                      ...prev,
                      [key]: {
                        present: value,
                        reste: value ? '' : prev[key].reste,
                      },
                    }));
                  }}
                  onAffaireResteChange={(key, value) => {
                    setAffaires((prev) => ({
                      ...prev,
                      [key]: { ...prev[key], reste: value },
                    }));
                  }}
                  disabled={isLocked}
                />
              </FormSection>
            </>
          )}

          {showChrono && (
            <FormSection title={t('forms.opening.sectionChrono')} danger={chronoOutOfRangeAttempts > 0}>
              <p
                className="whitespace-pre-line text-sm leading-relaxed"
                style={{ color: chronoOutOfRangeAttempts > 0 ? colors.DANGER : colors.TEXT_PRIMARY }}
              >
                {t('forms.opening.chronoIntro')}
              </p>
              <FormDurationInput
                label=""
                value={chrono}
                onChange={(v) => {
                  setChrono(v);
                  if (fieldError === 'chrono') setFieldError(null);
                }}
                required
                error={fieldError === 'chrono' || chronoOutOfRangeAttempts > 0}
                readOnly={isLocked}
              />
            </FormSection>
          )}

          <FormSection
            title={t('forms.opening.sectionNotes')}
            optional
            optionalLabel={t('forms.common.optional')}
          >
            <div className="space-y-1.5">
              <textarea
                placeholder={isLocked ? undefined : t('forms.opening.observationsPlaceholder')}
                value={form.observations}
                readOnly={isLocked}
                onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                rows={3}
                className="min-h-[80px] w-full resize-none rounded-xl border px-3 py-3 text-base"
                style={{
                  color: colors.TEXT_PRIMARY,
                  borderColor: colors.BORDER,
                  backgroundColor: isLocked ? colors.BG_PRIMARY : colors.BG_SECONDARY,
                  borderRadius: RADIUS.sm,
                  opacity: isLocked ? 0.92 : 1,
                }}
              />
            </div>
          </FormSection>

          <div
            className="rounded-xl px-3.5 py-3 text-base font-bold"
            style={{ backgroundColor: '#FFD000', color: '#FFFFFF' }}
          >
            {t('forms.opening.googleReviewReminder')}
          </div>
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
