'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { AssignmentBanner } from '../components/home/AssignmentBanner';
import { HomeButton } from '../components/home/HomeButton';
import { usePlanning } from '../hooks/api/usePlanning';
import { useThemeColors } from '../hooks/useThemeColors';
import { useTranslation } from '../hooks/useTranslation';
import { useDemoDate } from '../hooks/useDemoDate';
import { formatWeekdayDayMonth } from '../lib/formatDate';

export default function HomePage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();

  const { today, weekYear, weekMonth, nextWeekStart, nextWeekEnd, mockTimeRanges } = useDemoDate();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const missions = planningData?.planning ?? [];

  const sortedMissions = useMemo(
    () => [...missions].sort((a, b) => a.day - b.day),
    [missions],
  );

  const todayMission = useMemo(
    () =>
      sortedMissions.find(
        (m) =>
          m.day === today.getDate() &&
          m.month === today.getMonth() + 1 &&
          m.year === today.getFullYear(),
      ) ?? null,
    [sortedMissions, today],
  );

  const todayTime = todayMission ? (mockTimeRanges[todayMission.site_id] ?? null) : null;

  const nextMission = useMemo(
    () =>
      sortedMissions.find((m) => {
        const mDate = new Date(m.year, m.month - 1, m.day);
        return mDate > today;
      }) ?? null,
    [sortedMissions, today],
  );

  const nextDayLabel = useMemo(() => {
    if (!nextMission) return null;
    return formatWeekdayDayMonth(
      new Date(nextMission.year, nextMission.month - 1, nextMission.day),
    );
  }, [nextMission]);

  const hasTodayMission = todayMission !== null;

  return (
    <div className="flex-1 overflow-y-auto pt-5 pb-10" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <AssignmentBanner
        todayMission={todayMission}
        todayTime={todayTime}
        nextMission={nextMission}
        nextDayLabel={nextDayLabel}
      />

      <div className="flex flex-wrap gap-3 px-5 pt-1">
        <HomeButton
          icon="sunny-outline"
          label={t('screens.home.openingButton')}
          onPress={() => {
            if (!todayMission) return;
            router.push(`/opening?id=${todayMission.id}`);
          }}
          disabled={!hasTodayMission}
        />
        <HomeButton
          icon="moon-outline"
          label={t('screens.home.closingButton')}
          onPress={() => {
            if (!todayMission) return;
            router.push(`/closing?id=${todayMission.id}`);
          }}
          disabled={!hasTodayMission}
        />
        <HomeButton
          icon="calendar-outline"
          label={t('screens.home.planningButton')}
          onPress={() => router.push('/planning')}
        />
        <HomeButton
          icon="hand-left-outline"
          label={t('screens.home.availabilityButton')}
          onPress={() =>
            router.push(
              `/availability?startDate=${nextWeekStart.toISOString()}&endDate=${nextWeekEnd.toISOString()}`,
            )
          }
        />
        <HomeButton
          icon="messages-outline"
          label={t('screens.home.messagesButton')}
          onPress={() => {}}
          disabled
        />
        <HomeButton
          icon="video-outline"
          label={t('screens.home.trainingVideoButton')}
          onPress={() => {}}
          disabled
        />
      </div>
    </div>
  );
}
