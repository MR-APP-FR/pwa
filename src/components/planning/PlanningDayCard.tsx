'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
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

  const leftLabel = [formatWeekday(date), formatDayMonth(date), timeRange]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  return (
    <div
      className="mx-4 mb-3 px-4 py-3"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.md,
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
      <div className="flex items-center justify-between gap-3">
        <p
          className="min-w-0 truncate text-[13px] font-bold uppercase leading-tight tracking-wide"
          style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {leftLabel}
        </p>
        {mission ? (
          <p
            className="min-w-0 max-w-[48%] truncate text-right text-[13px] font-bold uppercase leading-tight tracking-wide"
            style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
          >
            {mission.site_name}
          </p>
        ) : (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.ACCENT_RED_MUTED }}
            aria-label={t('screens.planning.noMissionDay')}
          >
            <X size={16} color={colors.ACCENT_RED} strokeWidth={2.5} />
          </span>
        )}
      </div>
    </div>
  );
}
