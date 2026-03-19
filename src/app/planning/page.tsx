'use client';

import { useMemo } from 'react';
import { PlanningDayCard } from '../../components/planning/PlanningDayCard';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { PlanningWithColleague } from '../../database/types';
import { TODAY, WEEK_YEAR, WEEK_MONTH, WEEK_START, MOCK_TIME_RANGES_FULL } from '../../constants/mock';

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
      timeRange: mission ? MOCK_TIME_RANGES_FULL[mission.site_id] : undefined,
    });
  }
  return days;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const s = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const e = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Semaine du ${s} au ${e}`;
}

export default function PlanningPage() {
  const { colors } = useThemeColors();
  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });
  const missions = planningData?.planning ?? [];

  const weekDays = useMemo(
    () => getWeekDays(WEEK_START, missions, TODAY),
    [missions],
  );

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <p
        className="text-sm font-medium text-center py-4"
        style={{ color: colors.TEXT_SECONDARY }}
      >
        {formatWeekRange(WEEK_START)}
      </p>
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
