'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { AssignmentBanner } from '../components/home/AssignmentBanner';
import { HomeButton } from '../components/home/HomeButton';
import { HomeFooter } from '../components/home/HomeFooter';
import { DispoDerniereMinuteToggle } from '../components/home/DispoDerniereMinuteToggle';
import { usePlanning } from '../hooks/api/usePlanning';
import { useSiteWeather } from '../hooks/api/useSiteWeather';
import { useUnreadStaffMessageCount } from '../hooks/api/useStaffMessages';
import { useCurrentUser } from '../hooks/api/useCurrentUser';
import { useWeatherBriefRead } from '../hooks/useWeatherBriefRead';
import { useTranslation } from '../hooks/useTranslation';
import { useAppDate } from '../hooks/useAppDate';
import { formatWeekdayDayMonth } from '../lib/formatDate';
import { toIsoDateString } from '../lib/parisTime';

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();

  const { today, weekYear, weekMonth, nextWeekStart, nextWeekEnd } = useAppDate();
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
  const todayIso = toIsoDateString(today);
  const unreadStaffCount = useUnreadStaffMessageCount();
  const { data: currentUser } = useCurrentUser();
  const { data: todayWeather } = useSiteWeather(
    todayMission?.site_id ?? null,
    hasTodayMission ? todayIso : null,
  );
  const { isRead: weatherBriefRead, markRead: markWeatherBriefRead } = useWeatherBriefRead(
    currentUser?.user.id ?? null,
    todayWeather ? todayIso : null,
    todayMission?.site_id ?? null,
  );
  const unreadMessageCount =
    unreadStaffCount + (todayWeather && !weatherBriefRead ? 1 : 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex min-h-full flex-1 flex-col gap-2.5 px-4 pb-4 pt-3">
      <AssignmentBanner
        todayMission={todayMission}
        nextMission={nextMission}
        nextDayLabel={nextDayLabel}
        todayWeather={todayWeather ?? null}
        onWeatherOpen={markWeatherBriefRead}
      />

      {!hasTodayMission && <DispoDerniereMinuteToggle dateIso={todayIso} />}

      <div className="grid grid-cols-2 gap-2.5">
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
              `/availability?startDate=${toIsoDateString(nextWeekStart)}&endDate=${toIsoDateString(nextWeekEnd)}`,
            )
          }
        />
        <HomeButton
          icon="messages-outline"
          label={t('screens.home.messagesButton')}
          onPress={() => router.push('/messages')}
          badgeCount={unreadMessageCount}
        />
        <HomeButton
          icon="video-outline"
          label={t('screens.home.trainingVideoButton')}
          onPress={() => router.push('/training')}
        />
        <HomeButton
          icon="suggestion-outline"
          label={t('screens.home.suggestionsButton')}
          onPress={() => router.push('/suggestions')}
        />
        <HomeButton
          icon="map-pin-outline"
          label={t('screens.home.sitesMapButton')}
          onPress={() => router.push('/sites-map')}
        />
      </div>

      <HomeFooter />
      </div>
    </div>
  );
}
