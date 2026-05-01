'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { AssignmentBanner } from '../components/home/AssignmentBanner';
import { HomeButton } from '../components/home/HomeButton';
import { usePlanning } from '../hooks/api/usePlanning';
import { useThemeColors } from '../hooks/useThemeColors';
import { useTranslation } from '../hooks/useTranslation';
import { TODAY, WEEK_YEAR, WEEK_MONTH, NEXT_WEEK_START, NEXT_WEEK_END, MOCK_TIME_RANGES } from '../constants/mock';

export default function HomePage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();

  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });
  const missions = planningData?.planning ?? [];

  const sortedMissions = useMemo(
    () => [...missions].sort((a, b) => a.day - b.day),
    [missions],
  );

  const todayMission = useMemo(
    () =>
      sortedMissions.find(
        (m) =>
          m.day === TODAY.getDate() &&
          m.month === TODAY.getMonth() + 1 &&
          m.year === TODAY.getFullYear(),
      ) ?? null,
    [sortedMissions],
  );

  const todayTime = todayMission ? (MOCK_TIME_RANGES[todayMission.site_id] ?? null) : null;

  const nextMission = useMemo(
    () =>
      sortedMissions.find((m) => {
        const mDate = new Date(m.year, m.month - 1, m.day);
        return mDate > TODAY;
      }) ?? null,
    [sortedMissions],
  );

  const nextDayLabel = useMemo(() => {
    if (!nextMission) return null;
    const d = new Date(nextMission.year, nextMission.month - 1, nextMission.day);
    const label = d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
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
          icon="alert-circle-outline"
          label={t('screens.home.dailyInfoButton')}
          onPress={() => {
            if (!todayMission) return;
            router.push(`/info-jour?id=${todayMission.id}`);
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
              `/availability?startDate=${NEXT_WEEK_START.toISOString()}&endDate=${NEXT_WEEK_END.toISOString()}`,
            )
          }
        />
        <HomeButton
          icon="settings-outline"
          label={t('screens.home.settingsButton')}
          onPress={() => router.push('/profil')}
        />
      </div>
    </div>
  );
}
