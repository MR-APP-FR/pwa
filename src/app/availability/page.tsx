'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useTransition, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { formatPlanningDayLabel, formatWeekRange } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { PageSectionTitle } from '../../components/layout/PageSectionTitle';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { YesNoToggle } from '../../components/common/YesNoToggle';
import { useAvailability } from '../../hooks/api/useAvailability';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { isBrowserOffline } from '../../lib/offline';
import { parseIsoDateAsLocalDate, toIsoDateString, toParisLocalDate } from '../../lib/parisTime';
import { submitAvailability } from './actions';

interface DayAvailability {
  available: boolean;
}

function buildWeekDays(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d;
  });
}

function AvailabilityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  // Jamais `new Date(dateString)` (parse en UTC, glisse d'un jour selon le
  // fuseau du runtime) — cf. audit 2026-08-18 §3.5.
  const start = startDate ? parseIsoDateAsLocalDate(startDate) : toParisLocalDate();
  const end = endDate ? parseIsoDateAsLocalDate(endDate) : toParisLocalDate();
  const weekDays = buildWeekDays(start);
  const weekIso = weekDays.map(toIsoDateString);

  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;
  const { data: existing, isLoading: loadingExisting } = useAvailability(
    weekIso[0] ?? '',
    weekIso[6] ?? '',
  );

  const [availability, setAvailability] = useState<DayAvailability[]>(
    weekDays.map(() => ({ available: true })),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasSavedWeek = (existing?.length ?? 0) > 0;
  const locked = hasSavedWeek && !isEditing;

  // Préremplit avec les disponibilités déjà enregistrées (statut des jours).
  useEffect(() => {
    if (!existing || existing.length === 0) return;
    const byDate = new Map(existing.map((r) => [r.date, r]));
    setAvailability((prev) =>
      prev.map((day, i) => {
        const row = byDate.get(weekIso[i] ?? '');
        return row ? { available: row.available } : day;
      }),
    );
    // weekIso dérive des searchParams (stables pour un rendu donné).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const handleSend = () => {
    setSubmitError(null);
    setJustSaved(false);
    if (!currentUser?.user) {
      setSubmitError('Session invalide. Reconnecte-toi.');
      return;
    }
    if (isBrowserOffline()) {
      setSubmitError(t('forms.common.errorOffline'));
      return;
    }
    const days = weekDays.map((date, i) => ({
      date: toIsoDateString(date),
      available: availability[i]?.available ?? true,
      // Motif d’indispo retiré (demande Valeria / OK Kevin) — colonne DB conservée.
      note: null,
    }));
    startTransition(async () => {
      const result = await submitAvailability(days);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ['availability', employeeId, weekIso[0] ?? '', weekIso[6] ?? ''],
      });
      setIsEditing(false);
      setJustSaved(true);
    });
  };

  const setDayAvailable = (index: number, available: boolean) => {
    if (locked) return;
    setAvailability((prev) =>
      prev.map((d, i) => (i === index ? { ...d, available } : d)),
    );
  };

  const yesLabel = t('forms.opening.fondDeCaisseYes');
  const noLabel = t('forms.opening.fondDeCaisseNo');

  const footerLabel = (() => {
    if (pending) return t('availability.sending');
    if (locked) return t('availability.modify');
    if (hasSavedWeek) return t('availability.saveChanges');
    return t('availability.send');
  })();

  return (
    <FormScrollLayout
      footer={
        <div className="px-5 py-4 space-y-2" style={{ backgroundColor: colors.BG_SECONDARY }}>
          {submitError && (
            <p className="text-sm text-center" style={{ color: colors.ACCENT_RED }}>
              {submitError}
            </p>
          )}
          <PrimaryButton
            onClick={() => {
              if (locked) {
                setJustSaved(false);
                setIsEditing(true);
                return;
              }
              handleSend();
            }}
            disabled={pending || loadingExisting}
            className="w-full py-4 text-base"
            style={
              locked
                ? {
                    backgroundColor: colors.BG_PRIMARY,
                    color: colors.PRIMARY,
                    boxShadow: `inset 0 0 0 1.5px ${colors.PRIMARY}`,
                  }
                : undefined
            }
          >
            {footerLabel}
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="yellow"
            title={t('availability.title')}
            showBack
          />
        </FormPinnedPageHeader>
        <PageSectionTitle title={formatWeekRange(start, end)} />

        <p
          className="px-5 pt-2 pb-3 text-center text-sm"
          style={{ color: colors.TEXT_SECONDARY }}
        >
          {t('availability.description')}
        </p>

        {(locked || justSaved) && (
          <p
            className="mx-4 mb-3 rounded-xl px-3 py-2 text-center text-sm font-semibold"
            style={{
              color: colors.ACCENT_GREEN,
              backgroundColor: colors.ACCENT_GREEN_MUTED,
            }}
          >
            {justSaved ? t('availability.sent') : t('availability.alreadySent')}
          </p>
        )}

        <div className="space-y-2.5 px-4 pb-4">
          {weekDays.map((date, index) => {
            const day = availability[index];
            if (!day) return null;
            return (
              <div
                key={date.toISOString()}
                className="card-surface px-3.5 py-3"
                style={locked ? { opacity: 0.72 } : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="min-w-0 text-sm font-bold leading-snug"
                    style={{
                      color: day.available ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY,
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {formatPlanningDayLabel(date)}
                  </span>
                  <YesNoToggle
                    compact
                    value={day.available}
                    onChange={(available) => setDayAvailable(index, available)}
                    yesLabel={yesLabel}
                    noLabel={noLabel}
                    disabled={locked || pending}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {isEditing && hasSavedWeek ? (
          <div className="px-5 pb-4">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setSubmitError(null);
                if (!existing || existing.length === 0) return;
                const byDate = new Map(existing.map((r) => [r.date, r]));
                setAvailability(
                  weekDays.map((_, i) => {
                    const row = byDate.get(weekIso[i] ?? '');
                    return { available: row?.available ?? true };
                  }),
                );
              }}
              className="w-full text-center text-sm font-semibold"
              style={{ color: colors.TEXT_SECONDARY }}
            >
              {t('availability.cancelEdit')}
            </button>
          </div>
        ) : null}

        {!hasSavedWeek && !loadingExisting ? (
          <div className="px-5 pb-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-full text-center text-sm"
              style={{ color: colors.TEXT_SECONDARY }}
            >
              {t('availability.backToPlanning')}
            </button>
          </div>
        ) : null}
      </div>
    </FormScrollLayout>
  );
}

export default function AvailabilityPage() {
  return (
    <Suspense>
      <AvailabilityContent />
    </Suspense>
  );
}
