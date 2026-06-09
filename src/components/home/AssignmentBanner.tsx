'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { PlanningWithColleague } from '../../database/types';

interface AssignmentBannerProps {
  todayMission: PlanningWithColleague | null;
  todayTime: string | null;
  nextMission: PlanningWithColleague | null;
  nextDayLabel: string | null;
}

export function AssignmentBanner({
  todayMission,
  todayTime,
  nextMission,
  nextDayLabel,
}: AssignmentBannerProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <div className="px-5 pb-5">
      <div
        className="overflow-hidden rounded-3xl border shadow-sm"
        style={{
          backgroundColor: colors.SETTINGS_SECTION_BG,
          borderColor: colors.BORDER,
        }}
      >
        {/* Today */}
        <Link
          href={todayMission ? `/mission?id=${todayMission.id}` : '#'}
          className="group block no-underline transition-opacity active:opacity-80"
          style={{ backgroundColor: colors.PRIMARY }}
        >
          <div className="flex items-start gap-3 p-5">
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.TEXT_INVERSE + '18' }}
            >
              <MapPin size={20} color={colors.TEXT_INVERSE} strokeWidth={2} />
            </div>

            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: colors.TEXT_INVERSE + '99' }}
              >
                {t('screens.home.todayAssignment')}
              </p>
              {todayMission ? (
                <>
                  <p
                    className="mt-1 text-2xl font-bold leading-tight tracking-tight"
                    style={{ color: colors.TEXT_INVERSE }}
                  >
                    {todayMission.site_name}
                  </p>
                  {todayTime && (
                    <p className="mt-1 text-sm" style={{ color: colors.TEXT_INVERSE + 'BB' }}>
                      {todayTime}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-lg" style={{ color: colors.TEXT_INVERSE + 'CC' }}>
                  {t('screens.home.noAssignmentToday')}
                </p>
              )}
            </div>

            {todayMission && (
              <ChevronRight
                size={20}
                className="mt-1 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5"
                color={colors.TEXT_INVERSE}
              />
            )}
          </div>
        </Link>

        <div style={{ backgroundColor: colors.BORDER, height: 1 }} />

        {/* Next */}
        <Link
          href={nextMission ? `/mission?id=${nextMission.id}` : '#'}
          className="group block no-underline transition-opacity active:opacity-80"
        >
          <div className="flex items-start gap-3 p-5">
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.PRIMARY + '10' }}
            >
              <CalendarDays size={20} color={colors.PRIMARY} strokeWidth={2} />
            </div>

            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: colors.TEXT_SECONDARY }}
              >
                {t('screens.home.nextAssignment')}
              </p>
              {nextMission ? (
                <>
                  {nextDayLabel && (
                    <p
                      className="mt-1 text-base font-medium capitalize"
                      style={{ color: colors.TEXT_SECONDARY }}
                    >
                      {nextDayLabel}
                    </p>
                  )}
                  <p
                    className="mt-0.5 text-xl font-bold leading-tight tracking-tight"
                    style={{ color: colors.TEXT_PRIMARY }}
                  >
                    {nextMission.site_name}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-base" style={{ color: colors.TEXT_SECONDARY }}>
                  {t('screens.home.noNextAssignment')}
                </p>
              )}
            </div>

            {nextMission && (
              <ChevronRight
                size={20}
                className="mt-1 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5"
                color={colors.TEXT_SECONDARY}
              />
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
