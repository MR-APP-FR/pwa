'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { HOME_ASSIGNMENT_BG } from '../../constants/colors';
import { RADIUS } from '../../constants/design';
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

  const cardBase = {
    borderRadius: RADIUS.xl,
    boxShadow: colors.CARD_SHADOW,
  } as const;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {/* Aujourd'hui */}
      <div
        className="overflow-hidden"
        style={{
          ...cardBase,
          backgroundColor: HOME_ASSIGNMENT_BG,
        }}
      >
        <Link
          href={todayMission ? `/mission?id=${todayMission.id}` : '#'}
          className="group block no-underline transition-opacity active:opacity-90"
        >
          <div className="flex items-center gap-3 p-4">
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.sm,
                backgroundColor: 'rgba(255,255,255,0.22)',
              }}
            >
              <MapPin size={22} color={colors.TEXT_INVERSE} strokeWidth={2.25} />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font-display)' }}
              >
                {t('screens.home.todayAssignment')}
              </p>
              {todayMission ? (
                <>
                  <p
                    className="text-2xl font-extrabold leading-tight tracking-tight"
                    style={{ color: colors.TEXT_INVERSE, fontFamily: 'var(--font-display)' }}
                  >
                    {todayMission.site_name}
                  </p>
                  {todayTime && (
                    <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
                      {todayTime}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-lg font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {t('screens.home.noAssignmentToday')}
                </p>
              )}
            </div>

            {todayMission && (
              <ChevronRight
                size={22}
                className="shrink-0 opacity-80"
                color={colors.TEXT_INVERSE}
                strokeWidth={2.5}
              />
            )}
          </div>
        </Link>
      </div>

      {/* Prochaine */}
      <div
        className="overflow-hidden"
        style={{
          ...cardBase,
          backgroundColor: colors.SETTINGS_SECTION_BG,
          border: `1px solid ${colors.BORDER}`,
        }}
      >
        <Link
          href={nextMission ? `/mission?id=${nextMission.id}` : '#'}
          className="group block no-underline transition-opacity active:opacity-80"
        >
          <div className="flex items-center gap-3 p-4">
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.sm,
                backgroundColor: colors.ACCENT_GREEN_MUTED,
              }}
            >
              <CalendarDays size={22} color={colors.ACCENT_GREEN} strokeWidth={2.25} />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: colors.TEXT_SECONDARY, fontFamily: 'var(--font-display)' }}
              >
                {t('screens.home.nextAssignment')}
              </p>
              {nextMission ? (
                <>
                  {nextDayLabel && (
                    <p
                      className="text-base font-bold uppercase"
                      style={{ color: colors.ACCENT_BLUE }}
                    >
                      {nextDayLabel}
                    </p>
                  )}
                  <p
                    className="text-xl font-bold leading-tight tracking-tight"
                    style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
                  >
                    {nextMission.site_name}
                  </p>
                </>
              ) : (
                <p className="text-base" style={{ color: colors.TEXT_SECONDARY }}>
                  {t('screens.home.noNextAssignment')}
                </p>
              )}
            </div>

            {nextMission && (
              <ChevronRight
                size={22}
                className="shrink-0 opacity-40"
                color={colors.TEXT_SECONDARY}
                strokeWidth={2.5}
              />
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
