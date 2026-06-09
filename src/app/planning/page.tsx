'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PlanningDayCard } from '../../components/planning/PlanningDayCard';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { PlanningWithColleague } from '../../database/types';
import { useDemoDate } from '../../hooks/useDemoDate';
import { formatDayMonthYear } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';

interface WeekDay {
  date: Date;
  mission: PlanningWithColleague | null;
  isToday: boolean;
  timeRange?: string;
}

function getWeekDays(
  weekStart: Date,
  missions: PlanningWithColleague[],
  today: Date,
  timeRangesFull: Record<number, string>,
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
      timeRange: mission ? timeRangesFull[mission.site_id] : undefined,
    });
  }
  return days;
}

export default function PlanningPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { today, weekStart: baseWeekStart, mockTimeRangesFull } = useDemoDate();
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

  const weekDays = useMemo(
    () => getWeekDays(viewedWeekStart, missions, today, mockTimeRangesFull),
    [viewedWeekStart, missions, today, mockTimeRangesFull],
  );

  const weekSubtitle = t('screens.planning.planningWeekTitle', {
    date: formatDayMonthYear(viewedWeekStart),
  });

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <PageHeader
        title={t('screens.planning.title')}
        subtitle={weekSubtitle}
        showBack
        onBack={() => router.push('/')}
      />
      <div className="flex gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setWeekOffset((offset) => offset - 1)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-semibold transition-opacity active:opacity-70"
          style={{
            borderColor: colors.BORDER,
            backgroundColor: colors.BG_TERTIARY,
            color: colors.TEXT_PRIMARY,
          }}
        >
          <ChevronLeft size={18} strokeWidth={2} />
          {t('screens.planning.previousWeek')}
        </button>
        <button
          type="button"
          onClick={() => setWeekOffset((offset) => offset + 1)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition-opacity active:opacity-70"
          style={{
            backgroundColor: colors.PRIMARY,
            color: colors.TEXT_INVERSE,
          }}
        >
          {t('screens.planning.nextWeek')}
          <ChevronRight size={18} strokeWidth={2} />
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
  );
}
