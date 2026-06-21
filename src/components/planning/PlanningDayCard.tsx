'use client';

import { X } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PLANNING_DAY_ACCENTS } from '../../constants/colors';
import { RADIUS } from '../../constants/design';
import type { PlanningWithColleague } from '../../database/types';
import { formatDayMonth, formatWeekday } from '../../lib/formatDate';

interface PlanningDayCardProps {
  date: Date;
  mission: PlanningWithColleague | null;
  isToday: boolean;
  timeRange?: string;
  dayIndex?: number;
}

export function PlanningDayCard({ date, mission, isToday, timeRange, dayIndex = 0 }: PlanningDayCardProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const dayLabel = formatWeekday(date);
  const dateLabel = formatDayMonth(date);
  const accentKey = isToday ? 'ACCENT_GREEN' : PLANNING_DAY_ACCENTS[dayIndex % PLANNING_DAY_ACCENTS.length];
  const accentColor = colors[accentKey];
  const dotColor = mission ? accentColor : colors.TEXT_MUTED;

  const dayHeader = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden
        />
        <span
          className="text-sm font-bold leading-snug"
          style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {dayLabel} {dateLabel}
        </span>
      </div>
      {isToday && (
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{
            backgroundColor: colors.ACCENT_GREEN_MUTED,
            color: colors.ACCENT_GREEN,
            fontFamily: 'var(--font-display)',
          }}
        >
          Aujourd&apos;hui
        </span>
      )}
    </div>
  );

  return (
    <div
      className="mx-4 mb-3 p-4"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.md,
        boxShadow: colors.CARD_SHADOW,
        border: `1px solid ${colors.BORDER}`,
      }}
    >
      <div className="flex flex-col gap-1.5">
        {dayHeader}

        {mission ? (
          <>
            {timeRange && (
              <p className="pl-4 text-sm font-semibold leading-tight" style={{ color: accentColor }}>
                {timeRange}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 pl-4">
              <p
                className="min-w-0 truncate text-base font-extrabold leading-tight"
                style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
              >
                {mission.site_name}
              </p>
              {mission.colleague && (
                <p className="shrink-0 text-xs font-medium leading-tight" style={{ color: colors.TEXT_SECONDARY }}>
                  {t('screens.planning.withColleague')} {mission.colleague.first_name}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="pl-4 pt-0.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.ACCENT_RED_MUTED }}
              aria-label={t('screens.planning.noMissionDay')}
            >
              <X size={18} color={colors.ACCENT_RED} strokeWidth={2.5} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
