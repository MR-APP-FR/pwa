'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, Suspense, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { FormNumberInput } from '../../components/forms/FormNumberInput';
import { FormSection } from '../../components/forms/FormSection';
import { PannesSection, buildPannesDetail, type SujetReasons } from '../../components/forms/PannesSection';
import { useSujets } from '../../hooks/api/useSujets';
import type { ClosingFormData } from '../../types/form.types';
import Image from 'next/image';
import { useAppDate } from '../../hooks/useAppDate';
import { submitClosingForm } from './actions';
import { submitDailyInfo } from '../../lib/actions/daily-info';
import { isBrowserOffline } from '../../lib/offline';
import { formatDateTime, formatMissionDate } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
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
      key: 'payeManquanteRecuperee',
      labelKey: 'forms.closing.payeManquanteRecuperee',
      unit: 'eur',
      helpKey: 'forms.closing.payeManquanteHelp',
    },
    {
      key: 'payeDuJour',
      labelKey: 'forms.closing.payeDuJour',
      unit: 'eur',
      helpKey: 'forms.closing.payeDuJourHelp',
    },
    {
      key: 'payeDuDouble',
      labelKey: 'forms.closing.payeDuDouble',
      unit: 'eur',
      helpKey: 'forms.closing.payeDuDoubleHelp',
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

  const { data: sujets } = useSujets(mission?.site_id);

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
    observations: '',
    telecollectePhotoUri: null,
    telecollectePhotoSource: null,
    telecollectePhotoCapturedAtMs: null,
  });

  const [selectedSujetIds, setSelectedSujetIds] = useState<number[]>([]);
  const [sujetReasons, setSujetReasons] = useState<SujetReasons>({});

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<ClosingFieldKey | 'photo' | null>(null);
  const [envelopeConfirmed, setEnvelopeConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

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

  const formValid =
    form.recetteTotale !== null &&
    photoFile !== null &&
    form.telecollectePhotoSource !== null &&
    envelopeConfirmed;

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
          {section.fields.map(({ key, labelKey, unit, required, inputMode, helpKey }) => (
            <FormNumberInput
              key={key}
              label={t(labelKey)}
              value={form[key] as number | null}
              onChange={(v) => updateNumericField(key, v)}
              unit={unit}
              required={required}
              error={fieldError === key}
              inputMode={inputMode ?? 'decimal'}
              helpText={helpKey ? t(helpKey) : undefined}
            />
          ))}
        </div>
      </FormSection>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setFieldError(null);
      setForm((f) => {
        if (f.telecollectePhotoUri?.startsWith('blob:')) {
          URL.revokeObjectURL(f.telecollectePhotoUri);
        }
        const url = URL.createObjectURL(file);
        return {
          ...f,
          telecollectePhotoUri: url,
          telecollectePhotoSource: 'phototheque',
          telecollectePhotoCapturedAtMs: file.lastModified,
        };
      });
    }
    e.target.value = '';
  };

  const photoDateLabel =
    form.telecollectePhotoCapturedAtMs != null
      ? formatDateTime(new Date(form.telecollectePhotoCapturedAtMs))
      : null;

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
    if (form.recetteTotale === null) {
      setFieldError('recetteTotale');
      setSubmitError(t('forms.closing.step1Error'));
      return;
    }
    if (!photoFile || !form.telecollectePhotoSource) {
      setFieldError('photo');
      setSubmitError(t('forms.closing.errorPhoto'));
      return;
    }
    if (!envelopeConfirmed) {
      setSubmitError(t('forms.closing.envelopeError'));
      return;
    }

    setFieldError(null);

    const fd = new FormData();
    fd.set('siteId', String(mission.site_id));
    fd.set('date', `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`);

    for (const { key } of ALL_NUMERIC_FIELDS) {
      const dataKey = FORM_FIELD_TO_FORMDATA_KEY[key];
      if (!dataKey) continue;
      const value = form[key];
      fd.set(dataKey, value === null || value === undefined ? '' : String(value));
    }
    fd.set('observations', form.observations);
    fd.set('photo', photoFile);
    fd.set('photoSource', form.telecollectePhotoSource);
    if (form.telecollectePhotoCapturedAtMs != null) {
      fd.set('photoCapturedAtMs', String(form.telecollectePhotoCapturedAtMs));
    }

    const date = `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`;
    const hasPannes = selectedSujetIds.length > 0;

    startTransition(async () => {
      const result = await submitClosingForm(fd);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      if (hasPannes) {
        const dailyResult = await submitDailyInfo({
          siteId: mission.site_id,
          date,
          nettoyageVeille: null,
          panneSujetIds: selectedSujetIds,
          pannesAutre: null,
          pannes: buildPannesDetail(selectedSujetIds, sujetReasons, sujets ?? []),
          carteParking: null,
          musiqueDisney: null,
        });
        if (!dailyResult.ok) {
          setSubmitError(dailyResult.error);
          return;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['missionForms'] });
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
    <FormScrollLayout
      footer={
        <div className="px-4 py-3" style={{ backgroundColor: colors.BG_SECONDARY }}>
          <PrimaryButton
            onClick={handleSubmit}
            disabled={pending || !formValid}
            className="w-full py-4 text-base"
          >
            {pending ? '...' : t('forms.closing.submit')}
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            title={t('forms.closing.title')}
            subtitle={mission?.site_name}
            detail={
              mission
                ? formatMissionDate(mission.year, mission.month, mission.day)
                : undefined
            }
            showBack
          />
        </FormPinnedPageHeader>
        <div className="px-4 py-3">
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
                onClearPannes={() => {
                  setSelectedSujetIds([]);
                  setSujetReasons({});
                }}
              />
            </FormSection>

            {renderNumericSection(PAIE_SECTION)}

            <FormSection
              title={t('forms.closing.sectionNotes')}
              optional
              optionalLabel={t('forms.common.optional')}
            >
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

          {submitError && (
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
  );
}

export default function ClosingPage() {
  return (
    <Suspense>
      <ClosingContent />
    </Suspense>
  );
}
