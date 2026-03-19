'use client';

import Link from 'next/link';
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
    <div className="px-5 pb-5 flex flex-col gap-3">
      {/* Today */}
      <Link
        href={todayMission ? `/mission?id=${todayMission.id}` : '#'}
        className="block rounded-2xl p-5 no-underline"
        style={{ backgroundColor: colors.PRIMARY }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: colors.TEXT_INVERSE + 'AA' }}>
          {t('screens.home.todayAssignment')}
        </p>
        {todayMission ? (
          <>
            <p className="text-lg font-bold" style={{ color: colors.TEXT_INVERSE }}>
              {todayMission.site_name}
            </p>
            {todayTime && (
              <p className="text-sm mt-0.5" style={{ color: colors.TEXT_INVERSE + 'CC' }}>
                {todayTime}
              </p>
            )}
          </>
        ) : (
          <p className="text-base" style={{ color: colors.TEXT_INVERSE + 'CC' }}>
            {t('screens.home.noAssignmentToday')}
          </p>
        )}
      </Link>

      {/* Next */}
      <Link
        href={nextMission ? `/mission?id=${nextMission.id}` : '#'}
        className="block rounded-2xl p-5 border no-underline"
        style={{
          backgroundColor: colors.SETTINGS_SECTION_BG,
          borderColor: colors.BORDER,
        }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: colors.TEXT_SECONDARY }}>
          {t('screens.home.nextAssignment')}
        </p>
        {nextMission ? (
          <>
            <p className="text-base font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {nextMission.site_name}
            </p>
            {nextDayLabel && (
              <p className="text-sm mt-0.5" style={{ color: colors.TEXT_SECONDARY }}>
                {nextDayLabel}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.home.noNextAssignment')}
          </p>
        )}
      </Link>
    </div>
  );
}
