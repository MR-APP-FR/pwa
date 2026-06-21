'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { AssignmentBanner } from '../components/home/AssignmentBanner';
import { HomeButton } from '../components/home/HomeButton';
import { HomeFooter } from '../components/home/HomeFooter';
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
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ backgroundColor: colors.BG_SECONDARY }}
    >
      <div className="flex min-h-full flex-1 flex-col pt-3">
      <AssignmentBanner
        todayMission={todayMission}
        todayTime={todayTime}
        nextMission={nextMission}
        nextDayLabel={nextDayLabel}
      />

      <div className="grid grid-cols-2 gap-2.5 px-4 pb-2">
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
          onPress={() => router.push('/training')}
        />
        <HomeButton
          icon="map-pin-outline"
          label={t('screens.home.sitesMapButton')}
          onPress={() => router.push('/sites-map')}
          fullWidth
        />
      </div>

      <HomeFooter />
      </div>
    </div>
  );
}
