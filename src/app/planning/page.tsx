'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PlanningDayCard } from '../../components/planning/PlanningDayCard';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useSitesHeuresOuverture } from '../../hooks/api/useSitesHeuresOuverture';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { PlanningWithColleague } from '../../database/types';
import { useAppDate } from '../../hooks/useAppDate';
import { formatDayMonthYear } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import { dateIsoToJourSemaineKey, toIsoDateString, type HeuresSemaine } from '../../lib/parisTime';

interface WeekDay {
  date: Date;
  mission: PlanningWithColleague | null;
  isToday: boolean;
  timeRange?: string;
}

function formatHeureCourte(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return min === 0 ? `${h}H` : `${h}H${String(min).padStart(2, '0')}`;
}

/** Horaires du jour pour le site de la mission, dérivés de `site_infos.heures_semaine`. */
function buildTimeRange(
  mission: PlanningWithColleague | null,
  date: Date,
  heuresBySite: Map<number, HeuresSemaine>,
): string | undefined {
  if (!mission) return undefined;
  const heures = heuresBySite.get(mission.site_id);
  const jour = heures?.[dateIsoToJourSemaineKey(toIsoDateString(date))];
  const ouvre = formatHeureCourte(jour?.ouvre);
  return ouvre ?? undefined;
}

function getWeekDays(
  weekStart: Date,
  missions: PlanningWithColleague[],
  today: Date,
  heuresBySite: Map<number, HeuresSemaine>,
): WeekDay[] {
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const mission =
      missions.find(
        (m) =>
          m.day === date.getDate() &&
          m.month === date.getMonth() + 1 &&
          m.year === date.getFullYear(),
      ) ?? null;
    days.push({
      date,
      mission,
      isToday:
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear(),
      timeRange: buildTimeRange(mission, date, heuresBySite),
    });
  }
  return days;
}

export default function PlanningPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { today, weekStart: baseWeekStart } = useAppDate();
  const [weekOffset, setWeekOffset] = useState(0);

  const viewedWeekStart = useMemo(() => {
    const start = new Date(baseWeekStart);
    start.setDate(baseWeekStart.getDate() + weekOffset * 7);
    return start;
  }, [baseWeekStart, weekOffset]);

  const viewedYear = viewedWeekStart.getFullYear();
  const viewedMonth = viewedWeekStart.getMonth() + 1;

  const { data: planningData } = usePlanning({ year: viewedYear, month: viewedMonth });
  const missions = planningData?.planning ?? [];

  const weekSiteIds = useMemo(() => missions.map((m) => m.site_id), [missions]);
  const { data: heuresBySite } = useSitesHeuresOuverture(weekSiteIds);

  const weekDays = useMemo(
    () => getWeekDays(viewedWeekStart, missions, today, heuresBySite ?? new Map()),
    [viewedWeekStart, missions, today, heuresBySite],
  );

  const weekSubtitle = t('screens.planning.planningWeekTitle', {
    date: formatDayMonthYear(viewedWeekStart),
  });

  return (
    <FormScrollLayout>
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <FormPinnedPageHeader>
        <PageHeader
          pin="static"
          accent="primary"
          title={t('screens.planning.title')}
          subtitle={weekSubtitle}
          showBack
          onBack={() => router.push('/')}
        />
      </FormPinnedPageHeader>
      <div className="grid w-full grid-cols-2 gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setWeekOffset((offset) => offset - 1)}
          className="inline-flex w-full items-center justify-center gap-1 px-2 text-[13px] font-semibold whitespace-nowrap transition-all active:scale-[0.98]"
          style={{
            minHeight: TOUCH_TARGET,
            borderRadius: RADIUS.sm,
            backgroundColor: colors.SETTINGS_SECTION_BG,
            boxShadow: colors.CARD_SHADOW,
            color: colors.TEXT_PRIMARY,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} className="shrink-0" />
          {t('screens.planning.previousWeek')}
        </button>
        <button
          type="button"
          onClick={() => setWeekOffset((offset) => offset + 1)}
          className="inline-flex w-full items-center justify-center gap-1 px-2 text-[13px] font-semibold whitespace-nowrap transition-all active:scale-[0.98]"
          style={{
            minHeight: TOUCH_TARGET,
            borderRadius: RADIUS.sm,
            backgroundColor: colors.PRIMARY,
            color: colors.TEXT_INVERSE,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
          }}
        >
          {t('screens.planning.nextWeek')}
          <ChevronRight size={16} strokeWidth={2.5} className="shrink-0" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        {weekDays.map((day) => (
          <PlanningDayCard
            key={day.date.toISOString()}
            date={day.date}
            mission={day.mission}
            isToday={day.isToday}
            timeRange={day.timeRange}
          />
        ))}
      </div>
    </div>
    </FormScrollLayout>
  );
}
