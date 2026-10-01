'use client';

import { useMemo, useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PlanningDayCard } from '../../components/planning/PlanningDayCard';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useSitesHeuresOuverture } from '../../hooks/api/useSitesHeuresOuverture';
import {
  invalidateStaffMessageBadges,
  useStaffMessageCache,
} from '../../hooks/api/useStaffMessages';
import {
  invalidatePendingPlanningAcks,
  usePendingAckForWeek,
} from '../../hooks/api/usePlanningWeekAcks';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { PlanningWithColleague } from '../../database/types';
import { useAppDate } from '../../hooks/useAppDate';
import { formatDayMonthYear } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { PageSectionTitle } from '../../components/layout/PageSectionTitle';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import type { HeuresSemaine } from '../../lib/parisTime';
import { buildSiteDayHoursLabel } from '../../lib/formatHeuresSite';
import { parseIsoDateAsLocalDate, toIsoDateString } from '../../lib/parisTime';
import { markUnreadPlanningAssignedRead } from '../messages/actions';
import { validatePlanningWeek } from './actions';

interface WeekDay {
  date: Date;
  mission: PlanningWithColleague | null;
  isToday: boolean;
  timeRange?: string;
}

function buildTimeRange(
  mission: PlanningWithColleague | null,
  date: Date,
  heuresBySite: Map<number, HeuresSemaine>,
): string | undefined {
  if (!mission) return undefined;
  return buildSiteDayHoursLabel(heuresBySite.get(mission.site_id), date) ?? undefined;
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

function weeksBetween(fromMonday: Date, toMonday: Date): number {
  const ms = toMonday.getTime() - fromMonday.getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

function PlanningPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { today, weekStart: baseWeekStart } = useAppDate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  const weekParam = searchParams.get('week');
  const initialOffset = useMemo(() => {
    if (!weekParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) return 0;
    const target = parseIsoDateAsLocalDate(weekParam);
    return weeksBetween(baseWeekStart, target);
  }, [weekParam, baseWeekStart]);

  const [weekOffset, setWeekOffset] = useState(initialOffset);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  useEffect(() => {
    setWeekOffset(initialOffset);
  }, [initialOffset]);

  const viewedWeekStart = useMemo(() => {
    const start = new Date(baseWeekStart);
    start.setDate(baseWeekStart.getDate() + weekOffset * 7);
    return start;
  }, [baseWeekStart, weekOffset]);

  const viewedWeekStartIso = toIsoDateString(viewedWeekStart);
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

  const { ack: pendingAck } = usePendingAckForWeek(viewedWeekStartIso);
  const hasMissionThisWeek = weekDays.some((d) => d.mission != null);

  const { queryClient: badgeQueryClient, employeeId } = useStaffMessageCache();
  const markedPlanningReadRef = useRef(false);

  useEffect(() => {
    if (markedPlanningReadRef.current) return;
    markedPlanningReadRef.current = true;
    void markUnreadPlanningAssignedRead().then((result) => {
      if (result.ok) {
        invalidateStaffMessageBadges(badgeQueryClient, employeeId);
      }
    });
  }, [badgeQueryClient, employeeId]);

  const handleValidate = async () => {
    setValidating(true);
    setValidateError(null);
    try {
      const result = await validatePlanningWeek(viewedWeekStartIso);
      if (!result.ok) {
        setValidateError(result.error);
        return;
      }
      invalidatePendingPlanningAcks(queryClient, currentUser?.user.id);
      invalidateStaffMessageBadges(badgeQueryClient, employeeId);
    } catch (err) {
      setValidateError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setValidating(false);
    }
  };

  return (
    <FormScrollLayout>
      <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="blue"
            title={t('screens.planning.title')}
            showBack
            onBack={() => router.push('/')}
          />
        </FormPinnedPageHeader>
        <div className="flex flex-col gap-3 px-0 pb-8 pt-4">
          <PageSectionTitle title={weekSubtitle} flush />
          <p className="px-5 text-center text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.planning.availabilityReminder')}
          </p>

          {pendingAck && hasMissionThisWeek ? (
            <div
              className="mx-4 flex flex-col gap-2 rounded-xl p-4"
              style={{
                backgroundColor: colors.SETTINGS_SECTION_BG,
                boxShadow: colors.CARD_SHADOW,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
                {t('screens.planning.validatePrompt')}
              </p>
              {validateError ? (
                <p className="text-sm" style={{ color: colors.DANGER }}>
                  {validateError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={validating}
                onClick={() => void handleValidate()}
                className="inline-flex w-full items-center justify-center px-3 font-semibold transition-all active:scale-[0.98] disabled:opacity-60"
                style={{
                  minHeight: TOUCH_TARGET,
                  borderRadius: RADIUS.sm,
                  backgroundColor: colors.PRIMARY,
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {validating
                  ? t('screens.planning.validating')
                  : t('screens.planning.validateCta')}
              </button>
            </div>
          ) : null}

          <div className="grid w-full grid-cols-2 gap-2 px-4">
            <button
              type="button"
              onClick={() => setWeekOffset((offset) => offset - 1)}
              className="inline-flex w-full items-center justify-center gap-1 px-3 font-semibold whitespace-nowrap transition-all active:scale-[0.98]"
              style={{
                minHeight: TOUCH_TARGET,
                borderRadius: RADIUS.sm,
                backgroundColor: colors.SETTINGS_SECTION_BG,
                boxShadow: colors.CARD_SHADOW,
                color: colors.TEXT_PRIMARY,
                fontFamily: 'var(--font-body)',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              <ChevronLeft size={16} strokeWidth={2.5} className="shrink-0" />
              {t('screens.planning.previousWeek')}
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((offset) => offset + 1)}
              className="inline-flex w-full items-center justify-center gap-1 px-3 font-semibold whitespace-nowrap transition-all active:scale-[0.98]"
              style={{
                minHeight: TOUCH_TARGET,
                borderRadius: RADIUS.sm,
                backgroundColor: colors.SETTINGS_SECTION_BG,
                boxShadow: colors.CARD_SHADOW,
                color: colors.TEXT_PRIMARY,
                fontFamily: 'var(--font-body)',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {t('screens.planning.nextWeek')}
              <ChevronRight size={16} strokeWidth={2.5} className="shrink-0" />
            </button>
          </div>
          <div className="flex flex-col gap-3 px-4">
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
      </div>
    </FormScrollLayout>
  );
}

export default function PlanningPage() {
  return (
    <Suspense fallback={null}>
      <PlanningPageInner />
    </Suspense>
  );
}
