'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

const DAY_LABELS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

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

function formatDayLabel(date: Date, index: number): string {
  const day = DAY_LABELS_FR[index] ?? '';
  return `${day} ${date.getDate()} ${date.toLocaleDateString('fr-FR', { month: 'long' })}`;
}

function formatWeekRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const e = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${s} au ${e}`;
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
  const [globalNote, setGlobalNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const toggleDay = (index: number) => {
    setAvailability((prev) =>
      prev.map((d, i) => (i === index ? { ...d, available: !d.available } : d)),
    );
  };

  const setDayNote = (index: number, note: string) => {
    setAvailability((prev) =>
      prev.map((d, i) => (i === index ? { ...d, note } : d)),
    );
  };

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <span className="text-6xl mb-2">&#x2705;</span>
        <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
          {t('availability.sent')}
        </h2>
        <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
          {t('availability.sentDescription')}
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
        <p className="text-base font-semibold capitalize" style={{ color: colors.TEXT_SECONDARY }}>
          {formatWeekRange(start, end)}
        </p>
        <p className="text-sm mb-2" style={{ color: colors.TEXT_SECONDARY }}>
          {t('availability.description')}
        </p>

        {weekDays.map((date, index) => {
          const day = availability[index];
          if (!day) return null;
          return (
            <div
              key={date.toISOString()}
              className="rounded-2xl border px-5 py-4 space-y-3"
              style={{
                backgroundColor: colors.SETTINGS_SECTION_BG,
                borderColor: day.available ? colors.PRIMARY + '40' : colors.BORDER,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-base font-semibold"
                  style={{ color: day.available ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY }}
                >
                  {formatDayLabel(date, index)}
                </span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAvailability((prev) =>
                        prev.map((d, i) => (i === index ? { ...d, available: true } : d)),
                      )
                    }
                    className="px-3 py-1 rounded-xl text-xs font-medium"
                    style={{
                      backgroundColor: day.available ? colors.SUCCESS_STRONG : colors.BG_SECONDARY,
                      color: day.available ? colors.TEXT_INVERSE : colors.TEXT_SECONDARY,
                      borderColor: day.available ? colors.SUCCESS_STRONG : colors.BORDER,
                      borderWidth: 1,
                      borderStyle: 'solid',
                    }}
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAvailability((prev) =>
                        prev.map((d, i) => (i === index ? { ...d, available: false } : d)),
                      )
                    }
                    className="px-3 py-1 rounded-xl text-xs font-medium"
                    style={{
                      backgroundColor: !day.available ? colors.DANGER_STRONG : colors.BG_SECONDARY,
                      color: !day.available ? colors.TEXT_INVERSE : colors.TEXT_SECONDARY,
                      borderColor: !day.available ? colors.DANGER_STRONG : colors.BORDER,
                      borderWidth: 1,
                      borderStyle: 'solid',
                    }}
                  >
                    Non
                  </button>
                </div>
              </div>
              {!day.available && (
                <input
                  type="text"
                  placeholder="Pour quelle raison ?"
                  value={day.note}
                  onChange={(e) => setDayNote(index, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{
                    color: colors.TEXT_PRIMARY,
                    borderColor: colors.BORDER,
                    backgroundColor: colors.BG_SECONDARY,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 py-4 border-t" style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}>
        <button
          onClick={() => setSubmitted(true)}
          className="w-full py-4 rounded-2xl text-base font-bold"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          {t('availability.send')}
        </button>
      </div>
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <Suspense>
      <AvailabilityContent />
    </Suspense>
  );
}
