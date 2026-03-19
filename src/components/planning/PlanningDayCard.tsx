'use client';

import Link from 'next/link';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { PlanningWithColleague } from '../../database/types';

interface PlanningDayCardProps {
  date: Date;
  mission: PlanningWithColleague | null;
  isToday: boolean;
  timeRange?: string;
}

export function PlanningDayCard({ date, mission, isToday, timeRange }: PlanningDayCardProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const dayLabel = date.toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateLabel = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  const content = (
    <div
      className="mx-5 mb-3 rounded-2xl border p-4"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderColor: isToday ? colors.SUCCESS_STRONG : colors.BORDER,
        borderWidth: isToday ? 2 : 1,
      }}
    >
      {mission ? (
        <div className="flex flex-col gap-1 mb-1">
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center gap-2">
              {isToday && (
                <span
                  className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: colors.SUCCESS_STRONG + '22', color: colors.SUCCESS_STRONG }}
                >
                  Aujourd&apos;hui
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-semibold capitalize"
              style={{ color: colors.TEXT_PRIMARY }}
            >
              {dayLabel} {dateLabel}
            </span>
            {timeRange && (
              <span className="text-sm leading-tight" style={{ color: colors.TEXT_SECONDARY }}>
                {timeRange}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-sm font-semibold capitalize"
            style={{ color: colors.TEXT_PRIMARY }}
          >
            {dayLabel} {dateLabel}
          </span>
          <div className="flex items-center gap-2">
            {isToday && (
              <span
                className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: colors.SUCCESS_STRONG + '22', color: colors.SUCCESS_STRONG }}
              >
                Aujourd&apos;hui
              </span>
            )}
            <span className="text-lg leading-none text-red-500">X</span>
          </div>
        </div>
      )}

      {mission ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p
            className="text-base font-bold leading-tight min-w-0 truncate"
            style={{ color: colors.TEXT_PRIMARY }}
          >
            {mission.site_name}
          </p>
          {mission.colleague && (
            <p className="text-xs leading-tight shrink-0" style={{ color: colors.TEXT_SECONDARY }}>
              {t('screens.planning.withColleague')} {mission.colleague.first_name}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );

  if (mission) {
    return (
      <Link href={`/mission?id=${mission.id}`} className="block no-underline">
        {content}
      </Link>
    );
  }

  return content;
}
