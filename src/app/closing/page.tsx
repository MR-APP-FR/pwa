'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, Suspense } from 'react';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { ClosingFormData } from '../../types/form.types';
import Image from 'next/image';
import { WEEK_YEAR, WEEK_MONTH } from '../../constants/mock';

function parseNumber(value: string): number | null {
  const trimmed = value.replace(',', '.').trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

const NUMERIC_FIELDS: { key: keyof ClosingFormData; labelKey: string }[] = [
  { key: 'recetteTotale', labelKey: 'forms.closing.recetteTotale' },
  { key: 'carteBleue', labelKey: 'forms.closing.carteBleue' },
  { key: 'nombreEnfants', labelKey: 'forms.closing.nombreEnfants' },
  { key: 'ticketsOuverture', labelKey: 'forms.closing.ticketsOuverture' },
  { key: 'ticketsFermeture', labelKey: 'forms.closing.ticketsFermeture' },
  { key: 'payeDuJour', labelKey: 'forms.closing.payeDuJour' },
  { key: 'payeManquanteRecuperee', labelKey: 'forms.closing.payeManquanteRecuperee' },
  { key: 'payeDuDouble', labelKey: 'forms.closing.payeDuDouble' },
  { key: 'pointCaisse13h', labelKey: 'forms.closing.pointCaisse13h' },
  { key: 'pointCaisse20h', labelKey: 'forms.closing.pointCaisse20h' },
];

function ClosingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t, language } = useTranslation();
  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

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
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
      ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(form.telecollectePhotoCapturedAtMs))
      : null;

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <span className="text-6xl mb-2">&#x2705;</span>
        <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
          {t('forms.closing.successTitle')}
        </h2>
        <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
          {t('forms.closing.successDescription')}
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
          {NUMERIC_FIELDS.map(({ key, labelKey }) => (
            <div key={key} className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t(labelKey)}</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => setForm((f) => ({ ...f, [key]: parseNumber(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ color: colors.TEXT_PRIMARY, borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY }}
              />
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t('forms.closing.observations')}</label>
            <textarea
              placeholder={t('forms.closing.observationsPlaceholder')}
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ color: colors.TEXT_PRIMARY, borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>{t('forms.closing.telecollectePhoto')}</label>
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
                  <Image src={form.telecollectePhotoUri} alt="Photo" width={72} height={72} className="rounded-lg object-cover" />
                  <div className="flex flex-col gap-1 flex-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2 rounded-lg border text-xs font-semibold"
                      style={{ borderColor: colors.PRIMARY, backgroundColor: colors.PRIMARY + '15', color: colors.PRIMARY }}
                    >
                      {t('forms.closing.changePhoto')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
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
                        })
                      }
                      className="py-2 rounded-lg border text-xs font-semibold"
                      style={{ borderColor: colors.BORDER, color: colors.TEXT_SECONDARY }}
                    >
                      {t('forms.closing.removePhoto')}
                    </button>
                  </div>
                </div>
                {photoDateLabel && (
                  <div
                    className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
                    style={{ borderColor: colors.BORDER, color: colors.TEXT_SECONDARY, backgroundColor: colors.BG_SECONDARY }}
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
                className="w-full py-3 rounded-lg border text-sm font-semibold"
                style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY, color: colors.TEXT_PRIMARY }}
              >
                {t('forms.closing.addPhoto')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t" style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}>
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          className="w-full py-4 rounded-2xl text-base font-bold"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          {t('forms.closing.submit')}
        </button>
      </div>
    </div>
  );
}

export default function ClosingPage() {
  return (
    <Suspense>
      <ClosingContent />
    </Suspense>
  );
}
