'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useSites } from '../../hooks/api/useSites';
import { useMissionForms } from '../../hooks/api/useMissionForms';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppDate } from '../../hooks/useAppDate';
import { formatDateLong } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import { HOME_BUTTON_ICON_GRADIENTS } from '../../constants/colors';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function MissionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { today, weekYear, weekMonth } = useAppDate();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const { data: sitesData } = useSites();

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

  const missionDateIso = mission
    ? `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`
    : undefined;
  const { data: formsStatus } = useMissionForms(mission?.site_id, missionDateIso);
  const hasOpening = formsStatus?.hasOpening ?? false;
  const hasClosing = formsStatus?.hasClosing ?? false;

  const sortedMissions = useMemo(
    () => [...(planningData?.planning ?? [])].sort((a, b) => a.day - b.day),
    [planningData?.planning],
  );

  const nextMission = useMemo(
    () =>
      sortedMissions.find((m) => {
        const mDate = new Date(m.year, m.month - 1, m.day);
        return mDate > today;
      }) ?? null,
    [sortedMissions, today],
  );

  if (!mission) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <p style={{ color: colors.TEXT_SECONDARY }}>Mission introuvable</p>
      </div>
    );
  }

  const siteFromList = sitesData?.sites.find((s) => Number(s.id) === Number(mission.site_id));
  const siteInfo = mission.site_details ?? siteFromList;

  const dateLabel = formatDateLong(new Date(mission.year, mission.month - 1, mission.day));

  const isTodayMission =
    mission.day === today.getDate() &&
    mission.month === today.getMonth() + 1 &&
    mission.year === today.getFullYear();

  const isNextMission = nextMission?.id === mission.id;

  const headerTitle = isTodayMission
    ? t('screens.home.todayAssignment')
    : isNextMission
      ? t('screens.home.nextAssignment')
      : t('screens.mission.title');

  const accentColor = isTodayMission
    ? colors.ACCENT_RED
    : isNextMission
      ? colors.ACCENT_BLUE
      : undefined;

  const hasGps = siteInfo?.latitude != null && siteInfo?.longitude != null;
  const mapsUrl = hasGps
    ? `https://maps.google.com/?q=${siteInfo!.latitude},${siteInfo!.longitude}`
    : '#';
  const adresseValue = siteInfo?.adresse?.trim() ?? '';
  const metroValue = siteInfo?.metro != null ? String(siteInfo.metro).trim() : '';
  const indicationValue = siteInfo?.indication?.trim() ?? '';

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <PageHeader
        title={headerTitle}
        subtitle={mission.site_name}
        detail={dateLabel}
        subtitleColor={accentColor}
        detailColor={accentColor}
        showBack
      />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {/* Site */}
        <div className="card-surface px-5 py-4 space-y-3">
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.address')}</span>
            <span
              className="text-sm font-medium text-right"
              style={{ color: adresseValue ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY }}
            >
              {adresseValue || '-'}
            </span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.metro')}</span>
            <span
              className="text-sm font-medium text-right"
              style={{ color: metroValue ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY }}
            >
              {metroValue || '-'}
            </span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.accessInfo')}</span>
            <span
              className="text-sm font-medium text-right"
              style={{ color: indicationValue ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY }}
            >
              {indicationValue || '-'}
            </span>
          </div>
          {hasGps && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block py-2.5 text-center text-sm font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: colors.PRIMARY,
                backgroundImage: 'none',
                color: colors.TEXT_INVERSE,
                borderRadius: RADIUS.sm,
                minHeight: TOUCH_TARGET,
                fontFamily: 'var(--font-display)',
              }}
            >
              {t('screens.planning.go')}
            </a>
          )}
        </div>

        {/* Role & colleague */}
        <div className="card-surface px-5 py-4 space-y-3">
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.role')}</span>
            <span className="text-sm font-medium text-right" style={{ color: colors.TEXT_PRIMARY }}>
              {mission.role === 'principal' ? t('screens.planning.principal') : t('screens.planning.double')}
            </span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.colleague')}</span>
            <span className="text-sm font-medium text-right" style={{ color: colors.TEXT_PRIMARY }}>
              {mission.colleague ? mission.colleague.fullname : t('screens.planning.solo')}
            </span>
          </div>
          {mission.colleague?.telephone && (
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.phone')}</span>
              <a
                href={`tel:${mission.colleague.telephone}`}
                className="text-sm font-medium text-right"
                style={{ color: colors.PRIMARY }}
              >
                {mission.colleague.telephone}
              </a>
            </div>
          )}
        </div>

        {/* Confirmation */}
        <div className="card-surface px-5 py-4 space-y-3">
          <div className="flex justify-between items-center gap-4">
            <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.status')}</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0"
              style={{
                backgroundColor: mission.user_confirmed ? colors.SUCCESS + '22' : colors.TEXT_SECONDARY + '22',
                color: mission.user_confirmed ? colors.SUCCESS : colors.TEXT_SECONDARY,
              }}
            >
              {mission.user_confirmed ? t('screens.planning.confirmed') : t('screens.planning.pending')}
            </span>
          </div>
          {mission.colleague && (
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm shrink-0" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.colleagueConfirmation')}</span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0"
                style={{
                  backgroundColor: mission.double_confirmed ? colors.SUCCESS + '22' : colors.TEXT_SECONDARY + '22',
                  color: mission.double_confirmed ? colors.SUCCESS : colors.TEXT_SECONDARY,
                }}
              >
                {mission.double_confirmed ? t('screens.planning.confirmed') : t('screens.planning.pending')}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isNextMission && (
        <div className="flex gap-3 px-5 py-4 border-t" style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}>
          <button
            onClick={() => router.push(`/opening?id=${mission.id}`)}
            className="min-h-[44px] flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98]"
            style={{
              backgroundImage: hasOpening ? 'none' : HOME_BUTTON_ICON_GRADIENTS.green,
              backgroundColor: hasOpening ? colors.SUCCESS : undefined,
              color: colors.TEXT_INVERSE,
              borderRadius: RADIUS.sm,
              fontFamily: 'var(--font-display)',
            }}
          >
            {hasOpening ? `✓ ${t('screens.planning.openingDone')}` : t('screens.planning.opening')}
          </button>
          <button
            onClick={() => router.push(`/closing?id=${mission.id}`)}
            className="min-h-[44px] flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98]"
            style={{
              backgroundImage: hasClosing ? 'none' : HOME_BUTTON_ICON_GRADIENTS.red,
              backgroundColor: hasClosing ? colors.SUCCESS : undefined,
              color: colors.TEXT_INVERSE,
              borderRadius: RADIUS.sm,
              fontFamily: 'var(--font-display)',
            }}
          >
            {hasClosing ? `✓ ${t('screens.planning.closingDone')}` : t('screens.planning.closing')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MissionPage() {
  return (
    <Suspense>
      <MissionContent />
    </Suspense>
  );
}
