'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import type { PlanningWithColleague } from '../../database/types';
import { formatDayMonth, formatWeekday } from '../../lib/formatDate';

interface PlanningDayCardProps {
  date: Date;
  mission: PlanningWithColleague | null;
  isToday: boolean;
  timeRange?: string;
}

export function PlanningDayCard({ date, mission, isToday, timeRange }: PlanningDayCardProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();

  const dateLabel = `${formatWeekday(date)} ${formatDayMonth(date)}`.toUpperCase();

  return (
    <div
      className="mx-4 mb-2 flex items-center justify-between gap-2 px-3"
      style={{
        minHeight: TOUCH_TARGET,
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.sm,
        boxShadow: colors.CARD_SHADOW,
        border: `1px solid ${isToday ? colors.ACCENT_GREEN : colors.BORDER}`,
        cursor: mission ? 'pointer' : undefined,
      }}
      role={mission ? 'button' : undefined}
      tabIndex={mission ? 0 : undefined}
      onClick={mission ? () => router.push(`/mission?id=${mission.id}`) : undefined}
      onKeyDown={
        mission
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/mission?id=${mission.id}`);
              }
            }
          : undefined
      }
    >
      <p
        className="min-w-0 truncate text-[16px] font-semibold uppercase leading-tight"
        style={{ color: colors.PRIMARY, fontFamily: 'var(--font-body)', fontSize: 16 }}
      >
        {dateLabel}
      </p>
      {mission ? (
        <span
          className="flex min-w-0 max-w-[62%] shrink items-center px-2.5 font-semibold leading-tight"
          style={{
            color: colors.TEXT_INVERSE,
            backgroundColor: colors.ACCENT_GREEN,
            borderRadius: RADIUS.sm,
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          <span className="min-w-0 truncate">{mission.site_name}</span>
          {timeRange ? <span className="shrink-0">&nbsp;{t('screens.planning.atTime', { time: timeRange })}</span> : null}
        </span>
      ) : (
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.ACCENT_RED }}
          aria-label={t('screens.planning.noMissionDay')}
        >
          <X size={16} color={colors.TEXT_INVERSE} strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}
