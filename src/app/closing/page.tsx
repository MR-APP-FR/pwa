'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useMemo, Suspense, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { FormNumberInput } from '../../components/forms/FormNumberInput';
import { FormSection } from '../../components/forms/FormSection';
import { PannesSection, buildPannesDetail, type SujetReasons } from '../../components/forms/PannesSection';
import { useSujets } from '../../hooks/api/useSujets';
import { useMissionForms } from '../../hooks/api/useMissionForms';
import { useSiteClosingChecklist,
  type ClosingChecklistItemKey,
} from '../../hooks/api/useSiteClosingChecklist';
import { useSiteCarteParking } from '../../hooks/api/useSiteCarteParking';
import { PhotoCaptureField, type CapturedPhoto } from '../../components/forms/PhotoCaptureField';
import { ConditionalQuestion } from '../../components/forms/ConditionalQuestion';
import type { ClosingFormData } from '../../types/form.types';
import Image from 'next/image';
import { useAppDate } from '../../hooks/useAppDate';
import { submitClosingForm } from './actions';
import { submitDailyInfo } from '../../lib/actions/daily-info';
import { isBrowserOffline } from '../../lib/offline';
import { compressImageFile } from '../../lib/compressImageFile';
import { formatDateTime, formatMissionDate } from '../../lib/formatDate';
import { getDevDateOverride } from '../../lib/dev/dateOverrideClient';
import { evaluateClosingForce, GEO_CLOSE_MAX_METERS } from '../../lib/geo';
import { requestGeolocation, type GeoFix } from '../../lib/geolocation';
import { closingDeadlineParisFromDateIso } from '../../lib/parisTime';
import { PageHeader } from '../../components/layout/PageHeader';
import { PageSectionTitle } from '../../components/layout/PageSectionTitle';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { FormMissingFieldsHint } from '../../components/forms/FormMissingFieldsHint';
import { BottomSheetModal } from '../../components/common/BottomSheetModal';
import { RADIUS } from '../../constants/design';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatEurAmount(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

type ClosingFieldKey = keyof ClosingFormData;

type ClosingSectionField = {
  key: ClosingFieldKey;
  labelKey: string;
  unit?: 'eur' | 'count';
  required?: boolean;
  inputMode?: 'decimal' | 'numeric';
  helpKey?: string;
};

type ClosingSection = {
  titleKey: string;
  fields: ClosingSectionField[];
};

const EARLY_SECTIONS: ClosingSection[] = [
  {
    titleKey: 'forms.closing.sectionRecettes',
    fields: [
      { key: 'recetteTotale', labelKey: 'forms.closing.recetteTotale', unit: 'eur', required: true },
      { key: 'carteBleue', labelKey: 'forms.closing.carteBleue', unit: 'eur' },
    ],
  },
  {
    titleKey: 'forms.closing.sectionComptages',
    fields: [
      { key: 'nombreEnfants', labelKey: 'forms.closing.nombreEnfants', unit: 'count', inputMode: 'numeric' },
      { key: 'ticketsOuverture', labelKey: 'forms.closing.ticketsOuverture', unit: 'count', inputMode: 'numeric' },
      { key: 'ticketsFermeture', labelKey: 'forms.closing.ticketsFermeture', unit: 'count', inputMode: 'numeric' },
    ],
  },
  {
    titleKey: 'forms.closing.sectionPointsCaisse',
    fields: [
      { key: 'pointCaisse13h', labelKey: 'forms.closing.pointCaisse13h', unit: 'eur' },
      { key: 'pointCaisse20h', labelKey: 'forms.closing.pointCaisse20h', unit: 'eur' },
    ],
  },
];

/** Section Paie en fin de formulaire (avant notes / photo / submit). */
const PAIE_SECTION: ClosingSection = {
  titleKey: 'forms.closing.sectionPaie',
  fields: [
    {
      key: 'payeDuJour',
      labelKey: 'forms.closing.payeDuJour',
      unit: 'eur',
    },
    {
      key: 'payeDuDouble',
      labelKey: 'forms.closing.payeDuDouble',
      unit: 'eur',
    },
    {
      key: 'payeManquanteRecuperee',
      labelKey: 'forms.closing.payeManquanteRecuperee',
      unit: 'eur',
    },
  ],
};

const ALL_NUMERIC_FIELDS = [...EARLY_SECTIONS, PAIE_SECTION].flatMap((s) => s.fields);

const FORM_FIELD_TO_FORMDATA_KEY: Record<ClosingFieldKey, string | null> = {
  missionId: null,
  recetteTotale: 'recetteTotale',
  carteBleue: 'carteBleue',
  nombreEnfants: 'nbEnfants',
  ticketsOuverture: 'ticketsOuverture',
  ticketsFermeture: 'ticketsFermeture',
  payeDuJour: 'payeJour',
  payeManquanteRecuperee: 'payeManquanteRecuperee',
  payeDuDouble: 'payeDouble',
  pointCaisse13h: 'pointCaisse13h',
  pointCaisse20h: 'pointCaisse20h',
  avisGoogleCount: null,
  observations: 'observations',
  telecollectePhotoUri: null,
  telecollectePhotoSource: null,
  telecollectePhotoCapturedAtMs: null,
};

function ClosingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { weekYear, weekMonth } = useAppDate();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const { data: currentUser } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);
  const missionDateIso = mission ? `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}` : null;

  const { data: sujets } = useSujets(mission?.site_id);
  const { data: closingChecklistItems } = useSiteClosingChecklist(mission?.site_id);
  const { data: carteParkingConfig } = useSiteCarteParking(mission?.site_id);
  const showParkingPhoto = carteParkingConfig?.enabled === true;
  const { data: formsStatus } = useMissionForms(mission?.site_id, missionDateIso ?? undefined);

  const [form, setForm] = useState<ClosingFormData>({
    missionId,
    recetteTotale: null,
    carteBleue: null,
    nombreEnfants: null,
    ticketsOuverture: null,
    ticketsFermeture: null,
    payeDuJour: null,
    payeManquanteRecuperee: null,
    payeDuDouble: null,
    pointCaisse13h: null,
    pointCaisse20h: null,
    avisGoogleCount: null,
    observations: '',
    telecollectePhotoUri: null,
    telecollectePhotoSource: null,
    telecollectePhotoCapturedAtMs: null,
  });

  const [checklist, setChecklist] = useState<Partial<Record<ClosingChecklistItemKey, boolean>>>({});
  const [selectedSujetIds, setSelectedSujetIds] = useState<number[]>([]);
  const [sujetReasons, setSujetReasons] = useState<SujetReasons>({});
  const [pannesAutre, setPannesAutre] = useState('');

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [parkingPhoto, setParkingPhoto] = useState<CapturedPhoto | null>(null);
  const [nettoyageFait, setNettoyageFait] = useState<boolean | null>(null);
  const [nettoyageRaison, setNettoyageRaison] = useState('');
  const [seauPhoto, setSeauPhoto] = useState<CapturedPhoto | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<
    ClosingFieldKey | 'photo' | 'parkingPhoto' | 'nettoyageFait' | 'nettoyageRaison' | 'seauPhoto' | null
  >(null);
  const [envelopeConfirmed, setEnvelopeConfirmed] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [forceModalOpen, setForceModalOpen] = useState(false);
  const [forceReasonEmpty, setForceReasonEmpty] = useState(false);
  const [geoFix, setGeoFix] = useState<GeoFix | null>(null);
  const [forceRevealed, setForceRevealed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [missingOpen, setMissingOpen] = useState(false);

  // X = espèces enveloppe ; Y = CB enveloppe (null → 0). Pas stockés en base.
  // Sorties espèces : CB + rémunérations + payé manquante récupérée.
  const enveloppeEspeces =
    (form.recetteTotale ?? 0) -
    (form.carteBleue ?? 0) -
    (form.payeDuJour ?? 0) -
    (form.payeDuDouble ?? 0) -
    (form.payeManquanteRecuperee ?? 0);
  const enveloppeCb = form.carteBleue ?? 0;
  const enveloppeAnomaly = enveloppeEspeces < 0;

  const closingDeadline = missionDateIso ? closingDeadlineParisFromDateIso(missionDateIso) : null;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(getDevDateOverride() ?? new Date());
  }, []);
  useEffect(() => {
    if (!closingDeadline || now >= closingDeadline) return;
    const id = setInterval(() => setNow(getDevDateOverride() ?? new Date()), 30_000);
    return () => clearInterval(id);
  }, [closingDeadline, now]);

  useEffect(() => {
    let cancelled = false;
    void requestGeolocation().then((fix) => {
      if (cancelled) return;
      setGeoFix(fix);
    });
    return () => {
      cancelled = true;
    };
  }, [mission?.site_id, missionDateIso]);

  const isBeforeClosingDeadline = closingDeadline !== null && now < closingDeadline;

  const forceCheck = evaluateClosingForce({
    anchorLatitude: formsStatus?.openingLat,
    anchorLongitude: formsStatus?.openingLng,
    clientLatitude: geoFix?.ok ? geoFix.latitude : null,
    clientLongitude: geoFix?.ok ? geoFix.longitude : null,
    beforeDeadline: isBeforeClosingDeadline,
  });
  const isFar = geoFix?.ok === true && forceCheck.distanceM != null;
  // Avant 20h05 on laisse remplir le formulaire : la validation classique
  // attend l'heure. « Forcer » seulement si trop loin, GPS KO déjà révélé,
  // ou choix explicite de fermer le site plus tôt.
  const needsForceUi = forceRevealed || isFar;
  const forceModalTitleKey = isFar
    ? 'forms.closing.forceReasonLabelFar'
    : forceCheck.geoFailed
      ? 'forms.closing.forceReasonLabelGeo'
      : 'forms.closing.forceReasonLabelEarly';
  const forceModalPlaceholderKey = isFar
    ? 'forms.closing.forceReasonPlaceholderFar'
    : forceCheck.geoFailed
      ? 'forms.closing.forceReasonPlaceholderGeo'
      : 'forms.closing.forceReasonPlaceholderEarly';

  const formValid =
    form.recetteTotale !== null &&
    photoFile !== null &&
    form.telecollectePhotoSource !== null &&
    (!showParkingPhoto || parkingPhoto !== null) &&
    nettoyageFait !== null &&
    (nettoyageFait === true ? seauPhoto !== null : nettoyageRaison.trim().length > 0) &&
    envelopeConfirmed;

  const missingFieldLabels = useMemo(() => {
    const items: string[] = [];
    if (form.recetteTotale === null) items.push(t('forms.closing.recetteTotale'));
    if (photoFile === null || form.telecollectePhotoSource === null) {
      items.push(t('forms.closing.telecollectePhoto'));
    }
    if (showParkingPhoto && parkingPhoto === null) {
      items.push(t('forms.closing.parkingPhoto'));
    }
    if (nettoyageFait === null) {
      items.push(t('forms.closing.nettoyageFait'));
    } else if (nettoyageFait === true && seauPhoto === null) {
      items.push(t('forms.closing.photoSeau'));
    } else if (nettoyageFait === false && nettoyageRaison.trim().length === 0) {
      items.push(
        t('forms.common.missingNoJustification', { field: t('forms.closing.nettoyageFait') }),
      );
    }
    if (!envelopeConfirmed) items.push(t('forms.closing.envelopeCheckbox'));
    return items;
  }, [
    form.recetteTotale,
    form.telecollectePhotoSource,
    photoFile,
    showParkingPhoto,
    parkingPhoto,
    nettoyageFait,
    seauPhoto,
    nettoyageRaison,
    envelopeConfirmed,
    t,
  ]);

  function updateNumericField(key: ClosingFieldKey, value: number | null) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldError === key) setFieldError(null);
    if (
      key === 'recetteTotale' ||
      key === 'carteBleue' ||
      key === 'payeDuJour' ||
      key === 'payeDuDouble' ||
      key === 'payeManquanteRecuperee'
    ) {
      setEnvelopeConfirmed(false);
    }
  }

  function renderNumericSection(section: ClosingSection) {
    return (
      <FormSection key={section.titleKey} title={t(section.titleKey)}>
        <div className="flex flex-col gap-4">
          {section.fields.map(({ key, labelKey, unit, required, inputMode }) => (
            <FormNumberInput
              key={key}
              label={t(labelKey)}
              value={form[key] as number | null}
              onChange={(v) => updateNumericField(key, v)}
              unit={unit}
              required={required}
              error={fieldError === key}
              inputMode={inputMode ?? 'decimal'}
            />
          ))}
        </div>
      </FormSection>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const capturedAtMs = file.lastModified;
    const compressed = await compressImageFile(file);
    setPhotoFile(compressed);
    setFieldError(null);
    setForm((f) => {
      if (f.telecollectePhotoUri?.startsWith('blob:')) {
        URL.revokeObjectURL(f.telecollectePhotoUri);
      }
      const url = URL.createObjectURL(compressed);
      return {
        ...f,
        telecollectePhotoUri: url,
        telecollectePhotoSource: 'phototheque',
        telecollectePhotoCapturedAtMs: capturedAtMs,
      };
    });
  };

  const photoDateLabel =
    form.telecollectePhotoCapturedAtMs != null
      ? formatDateTime(new Date(form.telecollectePhotoCapturedAtMs))
      : null;

  function assertClosingFormReady(): boolean {
    setSubmitError(null);
    if (!mission) {
      setSubmitError('Mission introuvable.');
      return false;
    }
    if (!currentUser?.user) {
      setSubmitError('Session invalide. Reconnecte-toi.');
      return false;
    }
    if (isBrowserOffline()) {
      setSubmitError(t('forms.common.errorOffline'));
      return false;
    }
    if (form.recetteTotale === null) {
      setFieldError('recetteTotale');
      setSubmitError(t('forms.closing.step1Error'));
      return false;
    }
    if (!photoFile || !form.telecollectePhotoSource) {
      setFieldError('photo');
      setSubmitError(t('forms.closing.errorPhoto'));
      return false;
    }
    if (showParkingPhoto && !parkingPhoto) {
      setFieldError('parkingPhoto');
      setSubmitError(t('forms.closing.errorParkingPhoto'));
      return false;
    }
    if (nettoyageFait === null) {
      setFieldError('nettoyageFait');
      setSubmitError(t('forms.closing.errorNettoyageFait'));
      return false;
    }
    if (nettoyageFait === true && !seauPhoto) {
      setFieldError('seauPhoto');
      setSubmitError(t('forms.closing.errorPhotoSeau'));
      return false;
    }
    if (nettoyageFait === false && nettoyageRaison.trim().length === 0) {
      setFieldError('nettoyageRaison');
      setSubmitError(t('forms.closing.errorNettoyageRaison'));
      return false;
    }
    if (!envelopeConfirmed) {
      setSubmitError(t('forms.closing.envelopeError'));
      return false;
    }
    setFieldError(null);
    return true;
  }

  function handleSubmit() {
    if (!assertClosingFormReady()) return;

    if (needsForceUi) {
      setForceReasonEmpty(false);
      setForceModalOpen(true);
      return;
    }

    if (isBeforeClosingDeadline) {
      return;
    }

    startClosingSubmit(null);
  }

  function handleCloseEarly() {
    if (!assertClosingFormReady()) return;
    setForceReasonEmpty(false);
    setForceModalOpen(true);
  }

  function handleForceConfirm() {
    const reason = forceReason.trim();
    if (reason.length === 0) {
      setForceReasonEmpty(true);
      return;
    }
    setForceReasonEmpty(false);
    startClosingSubmit(reason);
  }

  function startClosingSubmit(reason: string | null) {
    if (!mission || !photoFile || !form.telecollectePhotoSource) return;
    if (showParkingPhoto && !parkingPhoto) return;
    if (nettoyageFait === null) return;
    if (nettoyageFait === true && !seauPhoto) return;
    if (nettoyageFait === false && nettoyageRaison.trim().length === 0) return;

    const date = `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`;
    const hasPannes = selectedSujetIds.length > 0 || pannesAutre.trim().length > 0;
    const openingLat = formsStatus?.openingLat;
    const openingLng = formsStatus?.openingLng;
    const photoToUpload = photoFile;
    const photoSource = form.telecollectePhotoSource;

    startTransition(async () => {
      try {
        let clientLat: number | null = null;
        let clientLng: number | null = null;
        const fix = await requestGeolocation();
        setGeoFix(fix);
        if (fix.ok) {
          clientLat = fix.latitude;
          clientLng = fix.longitude;
        }

        const check = evaluateClosingForce({
          anchorLatitude: openingLat,
          anchorLongitude: openingLng,
          clientLatitude: clientLat,
          clientLongitude: clientLng,
          beforeDeadline: isBeforeClosingDeadline,
        });
        if (check.needsForce) {
          const trimmed = (reason ?? '').trim();
          if (trimmed.length === 0) {
            setForceRevealed(true);
            setForceReasonEmpty(false);
            setForceModalOpen(true);
            return;
          }
        }

        const fd = new FormData();
        fd.set('siteId', String(mission.site_id));
        fd.set('date', date);

        for (const { key } of ALL_NUMERIC_FIELDS) {
          const dataKey = FORM_FIELD_TO_FORMDATA_KEY[key];
          if (!dataKey) continue;
          const value = form[key];
          fd.set(dataKey, value === null || value === undefined ? '' : String(value));
        }
        fd.set('observations', form.observations);
        fd.set('avisGoogleCount', form.avisGoogleCount === null ? '' : String(form.avisGoogleCount));
        fd.set('checklist', JSON.stringify(checklist));
        fd.set('photo', photoToUpload);
        fd.set('photoSource', photoSource);
        if (form.telecollectePhotoCapturedAtMs != null) {
          fd.set('photoCapturedAtMs', String(form.telecollectePhotoCapturedAtMs));
        }
        if (showParkingPhoto && parkingPhoto) {
          fd.set('parkingPhoto', parkingPhoto.file);
          fd.set('parkingPhotoSource', parkingPhoto.source);
          fd.set('parkingPhotoCapturedAtMs', String(parkingPhoto.capturedAtMs));
        }
        fd.set('nettoyageFait', nettoyageFait ? '1' : '0');
        if (nettoyageFait === true && seauPhoto) {
          fd.set('seauPhoto', seauPhoto.file);
          fd.set('seauPhotoSource', seauPhoto.source);
          fd.set('seauPhotoCapturedAtMs', String(seauPhoto.capturedAtMs));
        }
        if (nettoyageFait === false) {
          fd.set('nettoyageRaison', nettoyageRaison.trim());
        }
        if (clientLat != null) fd.set('clientLat', String(clientLat));
        if (clientLng != null) fd.set('clientLng', String(clientLng));
        if (check.needsForce && reason) fd.set('forceReason', reason.trim());

        const result = await submitClosingForm(fd);
        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }

        setForceModalOpen(false);

        if (hasPannes) {
          // nettoyageVeille / carteParking / musiqueDisney omis (undefined) :
          // la fermeture ne recueille pas ces champs et ne doit pas écraser
          // ce que l'ouverture a déjà écrit sur la même ligne site/jour.
          const dailyResult = await submitDailyInfo({
            siteId: mission.site_id,
            date,
            panneSujetIds: selectedSujetIds,
            pannesAutre: pannesAutre.trim() || null,
            pannes: buildPannesDetail(selectedSujetIds, sujetReasons, sujets ?? []),
          });
          if (!dailyResult.ok) {
            setSubmitError(dailyResult.error);
            return;
          }
        }

        queryClient.invalidateQueries({ queryKey: ['missionForms'] });
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
            {t('forms.closing.successTitle')}
          </h2>
          <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.closing.successDescription')}
          </p>
          <PrimaryButton onClick={() => router.back()} className="mt-4 px-6 py-3 text-base">
            Retour au planning
          </PrimaryButton>
        </div>
      </FormScrollLayout>
    );
  }

  return (
    <>
    <FormScrollLayout
      footer={
        <div className="px-4 py-3" style={{ backgroundColor: colors.BG_SECONDARY }}>
          <FormMissingFieldsHint
            items={missingFieldLabels}
            open={missingOpen}
            onClose={() => setMissingOpen(false)}
          />
          <PrimaryButton
            onClick={() => {
              if (!formValid) {
                setMissingOpen(true);
                return;
              }
              handleSubmit();
            }}
            disabled={pending || (formValid && isBeforeClosingDeadline && !needsForceUi)}
            aria-disabled={!formValid || pending}
            className={`w-full py-4 text-base${!formValid && !pending ? ' opacity-45' : ''}`}
            style={needsForceUi ? { backgroundColor: colors.DANGER } : undefined}
          >
            {pending
              ? '...'
              : needsForceUi
                ? t('forms.closing.forceSubmit')
                : isBeforeClosingDeadline
                  ? t('forms.closing.waitSubmit')
                  : t('forms.closing.submit')}
          </PrimaryButton>
          {isBeforeClosingDeadline && !needsForceUi && (
            <PrimaryButton
              onClick={() => {
                if (!formValid) {
                  setMissingOpen(true);
                  return;
                }
                handleCloseEarly();
              }}
              disabled={pending}
              aria-disabled={!formValid || pending}
              className={`mt-2 w-full py-4 text-base${!formValid && !pending ? ' opacity-45' : ''}`}
              style={{ backgroundColor: colors.DANGER }}
            >
              {t('forms.closing.closeEarly')}
            </PrimaryButton>
          )}
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="red"
            title={t('forms.closing.title')}
            showBack
          />
        </FormPinnedPageHeader>
        {mission && (
          <PageSectionTitle
            title={mission.site_name}
            detail={formatMissionDate(mission.year, mission.month, mission.day)}
          />
        )}
        <div className="px-4 pb-3 pt-3">
          {needsForceUi && forceCheck.distanceM != null && (
            <div
              className="mb-3 rounded-xl border px-3 py-2.5 text-sm font-semibold"
              style={{
                borderColor: colors.DANGER,
                color: colors.DANGER,
                backgroundColor: colors.ACCENT_RED_MUTED,
              }}
              role="status"
            >
              {t('forms.closing.forceFar', {
                meters: String(forceCheck.distanceM),
                max: String(GEO_CLOSE_MAX_METERS),
              })}
            </div>
          )}
          {needsForceUi && forceRevealed && forceCheck.geoFailed && (
            <div
              className="mb-3 rounded-xl border px-3 py-2.5 text-sm font-semibold"
              style={{
                borderColor: colors.DANGER,
                color: colors.DANGER,
                backgroundColor: colors.ACCENT_RED_MUTED,
              }}
              role="status"
            >
              {t('forms.closing.forceGeoFailed')}
            </div>
          )}
          <div className="card-surface space-y-4 px-4 py-4">
            {EARLY_SECTIONS.map(renderNumericSection)}

            <FormSection title={t('forms.closing.sectionPannes')}>
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
                pannesAutre={pannesAutre}
                onPannesAutreChange={setPannesAutre}
                onClearPannes={() => {
                  setSelectedSujetIds([]);
                  setSujetReasons({});
                  setPannesAutre('');
                }}
              />
            </FormSection>

            {renderNumericSection(PAIE_SECTION)}

            {closingChecklistItems && closingChecklistItems.length > 0 && (
              <FormSection title={t('forms.closing.sectionChecklist')}>
                <div className="flex flex-col gap-2.5">
                  {closingChecklistItems.map((item) => (
                    <label
                      key={item}
                      className="flex min-h-[44px] items-center gap-3 text-sm font-medium"
                    >
                      <input
                        type="checkbox"
                        checked={checklist[item] ?? false}
                        onChange={(e) =>
                          setChecklist((prev) => ({ ...prev, [item]: e.target.checked }))
                        }
                        className="size-5 shrink-0"
                        style={{ accentColor: colors.PRIMARY }}
                      />
                      <span style={{ color: colors.TEXT_PRIMARY }}>
                        {t(`forms.closing.checklistItems.${item}`)}
                      </span>
                    </label>
                  ))}
                </div>
              </FormSection>
            )}

            {showParkingPhoto && (
              <FormSection title={t('forms.closing.sectionParkingPhoto')}>
                <PhotoCaptureField
                  label={t('forms.closing.parkingPhoto')}
                  value={parkingPhoto}
                  onChange={(photo) => {
                    setParkingPhoto(photo);
                    if (fieldError === 'parkingPhoto') setFieldError(null);
                  }}
                  required
                />
                {fieldError === 'parkingPhoto' && (
                  <p className="text-sm font-medium" style={{ color: colors.DANGER }}>
                    {t('forms.closing.errorParkingPhoto')}
                  </p>
                )}
              </FormSection>
            )}

            <FormSection title={t('forms.closing.sectionAvisGoogle')}>
              <FormNumberInput
                label={t('forms.closing.avisGoogleCount')}
                value={form.avisGoogleCount}
                onChange={(v) => setForm((f) => ({ ...f, avisGoogleCount: v }))}
                unit="count"
                inputMode="numeric"
              />
            </FormSection>

            <FormSection
              title={t('forms.closing.sectionNotes')}
              optional
              optionalLabel={t('forms.common.optional')}
            >
              <ConditionalQuestion
                label={t('forms.closing.nettoyageFait')}
                value={nettoyageFait}
                onChange={(v) => {
                  setNettoyageFait(v);
                  if (v) {
                    setNettoyageRaison('');
                  } else {
                    setSeauPhoto(null);
                  }
                  if (
                    fieldError === 'nettoyageFait' ||
                    fieldError === 'nettoyageRaison' ||
                    fieldError === 'seauPhoto'
                  ) {
                    setFieldError(null);
                  }
                }}
                yesLabel={t('forms.opening.fondDeCaisseYes')}
                noLabel={t('forms.opening.fondDeCaisseNo')}
                required
                error={fieldError === 'nettoyageFait'}
                noJustification={nettoyageRaison}
                onNoJustificationChange={(v) => {
                  setNettoyageRaison(v);
                  if (fieldError === 'nettoyageRaison') setFieldError(null);
                }}
                noJustificationPlaceholder={t('forms.common.noJustificationPlaceholder')}
                noJustificationError={fieldError === 'nettoyageRaison'}
              />
              {nettoyageFait === true && (
                <PhotoCaptureField
                  label={t('forms.closing.photoSeau')}
                  value={seauPhoto}
                  onChange={(photo) => {
                    setSeauPhoto(photo);
                    if (fieldError === 'seauPhoto') setFieldError(null);
                  }}
                  required
                />
              )}

              <textarea
                placeholder={t('forms.closing.observationsPlaceholder')}
                value={form.observations}
                onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                rows={2}
                className="min-h-[72px] w-full resize-none rounded-xl border px-3 py-3 text-base"
                style={{
                  color: colors.TEXT_PRIMARY,
                  borderColor: colors.BORDER,
                  backgroundColor: colors.BG_SECONDARY,
                  borderRadius: RADIUS.sm,
                }}
              />

              <div className="space-y-1.5 pt-2">
                <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                  {t('forms.closing.telecollectePhoto')}
                  <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
                    *
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {form.telecollectePhotoUri ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <Image
                        src={form.telecollectePhotoUri}
                        alt="Photo"
                        width={72}
                        height={72}
                        className="rounded-lg object-cover"
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="min-h-[44px] rounded-lg border py-2 text-xs font-semibold"
                          style={{
                            borderColor: colors.PRIMARY,
                            backgroundColor: colors.PRIMARY + '15',
                            color: colors.PRIMARY,
                          }}
                        >
                          {t('forms.closing.changePhoto')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoFile(null);
                            setForm((f) => {
                              if (f.telecollectePhotoUri?.startsWith('blob:')) {
                                URL.revokeObjectURL(f.telecollectePhotoUri);
                              }
                              return {
                                ...f,
                                telecollectePhotoUri: null,
                                telecollectePhotoSource: null,
                                telecollectePhotoCapturedAtMs: null,
                              };
                            });
                          }}
                          className="min-h-[44px] rounded-lg border py-2 text-xs font-semibold"
                          style={{ borderColor: colors.BORDER, color: colors.TEXT_SECONDARY }}
                        >
                          {t('forms.closing.removePhoto')}
                        </button>
                      </div>
                    </div>
                    {photoDateLabel && (
                      <div
                        className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
                        style={{
                          borderColor: colors.BORDER,
                          color: colors.TEXT_SECONDARY,
                          backgroundColor: colors.BG_SECONDARY,
                        }}
                      >
                        <p>
                          <span className="font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                            {t('forms.closing.photoSourceLabel')}
                          </span>{' '}
                          {form.telecollectePhotoSource === 'camera_live'
                            ? t('forms.closing.photoSourceLive')
                            : t('forms.closing.photoSourcePhototheque')}
                        </p>
                        <p className="mt-1">
                          <span className="font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                            {t('forms.closing.photoCapturedAt')}
                          </span>{' '}
                          {photoDateLabel}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[52px] w-full rounded-xl border py-3 text-sm font-semibold"
                    style={{
                      borderColor: fieldError === 'photo' ? colors.DANGER : colors.BORDER,
                      backgroundColor: colors.BG_SECONDARY,
                      color: colors.TEXT_PRIMARY,
                    }}
                  >
                    {t('forms.closing.addPhoto')}
                  </button>
                )}
              </div>
            </FormSection>

            <FormSection title={t('forms.closing.envelopeTitle')}>
              <div className="flex flex-col gap-3">
                {enveloppeAnomaly && (
                  <div
                    className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                    style={{
                      borderColor: colors.DANGER,
                      color: colors.DANGER,
                      backgroundColor: colors.ACCENT_RED_MUTED,
                    }}
                    role="alert"
                  >
                    {t('forms.closing.envelopeAnomaly', {
                      cash: formatEurAmount(enveloppeEspeces),
                    })}
                  </div>
                )}
                <p className="text-sm leading-relaxed" style={{ color: colors.TEXT_PRIMARY }}>
                  {t('forms.closing.envelopeConfirm', {
                    cash: formatEurAmount(enveloppeEspeces),
                    card: formatEurAmount(enveloppeCb),
                  })}
                </p>
                <label className="flex min-h-[44px] items-start gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={envelopeConfirmed}
                    onChange={(e) => {
                      setEnvelopeConfirmed(e.target.checked);
                      if (e.target.checked) setSubmitError(null);
                    }}
                    className="mt-1 size-5 shrink-0"
                    style={{ accentColor: colors.PRIMARY }}
                  />
                  <span style={{ color: colors.TEXT_PRIMARY }}>
                    {t('forms.closing.envelopeCheckbox')}
                  </span>
                </label>
              </div>
            </FormSection>
          </div>

          {submitError && !forceModalOpen && (
            <div
              className="mt-3 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: colors.DANGER, color: colors.DANGER, backgroundColor: colors.ACCENT_RED_MUTED }}
            >
              {submitError}
            </div>
          )}
        </div>
      </div>
    </FormScrollLayout>
    <BottomSheetModal
      isOpen={forceModalOpen}
      onClose={() => setForceModalOpen(false)}
      colors={colors}
      title={t(forceModalTitleKey)}
      titleId="closing-force-reason-title"
      closeAriaLabel={t('common.cancel')}
      doneLabel={t('forms.closing.forceSubmit')}
      hideDoneButton
    >
      <textarea
        autoFocus
        placeholder={t(forceModalPlaceholderKey)}
        value={forceReason}
        onChange={(e) => {
          setForceReason(e.target.value);
          if (e.target.value.trim()) setForceReasonEmpty(false);
        }}
        maxLength={500}
        rows={4}
        className="min-h-[96px] w-full resize-none rounded-xl border px-3 py-3 text-base"
        style={{
          color: colors.TEXT_PRIMARY,
          borderColor: forceReasonEmpty ? colors.DANGER : colors.BORDER,
          backgroundColor: colors.BG_PRIMARY,
          borderRadius: RADIUS.sm,
        }}
      />
      {forceReasonEmpty && (
        <p className="mt-2 text-sm font-semibold" style={{ color: colors.DANGER }} role="alert">
          {t('forms.closing.forceReasonError')}
        </p>
      )}
      {submitError && (
        <p className="mt-2 text-sm" style={{ color: colors.DANGER }} role="alert">
          {submitError}
        </p>
      )}
      <PrimaryButton
        onClick={handleForceConfirm}
        disabled={pending || forceReason.trim().length === 0}
        className="mt-4 w-full py-3.5 text-base"
        style={{ backgroundColor: colors.DANGER }}
      >
        {pending ? '...' : t('forms.closing.forceSubmit')}
      </PrimaryButton>
    </BottomSheetModal>
  </>
  );
}

export default function ClosingPage() {
  return (
    <Suspense>
      <ClosingContent />
    </Suspense>
  );
}
