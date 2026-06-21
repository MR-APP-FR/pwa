'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { formatPlanningDayLabel, formatWeekRange } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { YesNoToggle } from '../../components/common/YesNoToggle';
import { RADIUS } from '../../constants/design';

interface DayAvailability {
  available: boolean;
  note: string;
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
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date();
  const weekDays = buildWeekDays(start);

  const [availability, setAvailability] = useState<DayAvailability[]>(
    weekDays.map(() => ({ available: true, note: '' })),
  );
  const [submitted, setSubmitted] = useState(false);

  const setDayAvailable = (index: number, available: boolean) => {
    setAvailability((prev) =>
      prev.map((d, i) => (i === index ? { ...d, available } : d)),
    );
  };

  const setDayNote = (index: number, note: string) => {
    setAvailability((prev) =>
      prev.map((d, i) => (i === index ? { ...d, note } : d)),
    );
  };

  const yesLabel = t('forms.opening.fondDeCaisseYes');
  const noLabel = t('forms.opening.fondDeCaisseNo');

  if (submitted) {
    return (
      <FormScrollLayout>
        <div
          className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6"
          style={{ backgroundColor: colors.BG_SECONDARY }}
        >
          <span className="text-6xl mb-2">&#x2705;</span>
          <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
            {t('availability.sent')}
          </h2>
          <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
            {t('availability.sentDescription')}
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
          <PrimaryButton onClick={() => setSubmitted(true)} className="w-full py-4 text-base">
            {t('availability.send')}
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            title={t('availability.title')}
            subtitle={formatWeekRange(start, end)}
            showBack
          />
        </FormPinnedPageHeader>

        <div className="space-y-2.5 px-4 py-4">
          <p className="px-1 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {t('availability.description')}
          </p>

          {weekDays.map((date, index) => {
            const day = availability[index];
            if (!day) return null;
            return (
              <div
                key={date.toISOString()}
                className="card-surface space-y-2.5 px-3.5 py-3"
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
                  />
                </div>
                {!day.available && (
                  <input
                    type="text"
                    placeholder={t('availability.unavailableReasonPlaceholder')}
                    value={day.note}
                    onChange={(e) => setDayNote(index, e.target.value)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm"
                    style={{
                      color: colors.TEXT_PRIMARY,
                      borderColor: colors.BORDER,
                      backgroundColor: colors.BG_SECONDARY,
                      borderRadius: RADIUS.sm,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
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
