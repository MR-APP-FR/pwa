'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useSites } from '../../hooks/api/useSites';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { WEEK_YEAR, WEEK_MONTH } from '../../constants/mock';

function MissionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });
  const { data: sitesData } = useSites();

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);
  const site = sitesData?.sites.find((s) => s.id === mission?.site_id);

  if (!mission) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <p style={{ color: colors.TEXT_SECONDARY }}>Mission introuvable</p>
      </div>
    );
  }

  const dateLabel = new Date(mission.year, mission.month - 1, mission.day).toLocaleDateString(
    'fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  );

  const hasGps = site?.latitude != null && site?.longitude != null;
  const mapsUrl = hasGps
    ? `https://maps.google.com/?q=${site!.latitude},${site!.longitude}`
    : '#';

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {/* Site */}
        <div className="rounded-2xl border px-5 py-4 space-y-3" style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}>
          <h2 className="text-xl font-bold" style={{ color: colors.TEXT_PRIMARY }}>{mission.site_name}</h2>
          {site?.adresse && <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{site.adresse}</p>}
          {site?.metro && site.metro.length > 0 && (
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.metro')}</span>
              <span className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>{site.metro}</span>
            </div>
          )}
          {site?.indication && site.indication.length > 0 && (
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.accessInfo')}</span>
              <span className="text-sm font-medium text-right" style={{ color: colors.TEXT_PRIMARY }}>{site.indication}</span>
            </div>
          )}
          {hasGps && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center py-2 rounded-lg border text-sm font-semibold mt-1"
              style={{ borderColor: colors.PRIMARY, color: colors.PRIMARY }}
            >
              {t('screens.planning.go')}
            </a>
          )}
        </div>

        {/* Date & Role */}
        <div className="rounded-2xl border px-5 py-4 space-y-3" style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}>
          <div className="flex justify-between">
            <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>Date</span>
            <span className="text-sm font-medium capitalize" style={{ color: colors.TEXT_PRIMARY }}>{dateLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.role')}</span>
            <span className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
              {mission.role === 'principal' ? t('screens.planning.principal') : t('screens.planning.double')}
            </span>
          </div>
        </div>

        {/* Colleague */}
        <div className="rounded-2xl border px-5 py-4 space-y-3" style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}>
          <h3 className="text-base font-bold mb-1" style={{ color: colors.TEXT_PRIMARY }}>Collègue</h3>
          {mission.colleague ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: mission.colleague.couleur ?? colors.PRIMARY }}
                >
                  {(mission.colleague.first_name?.[0] ?? '?').toUpperCase()}
                </div>
                <span className="text-base font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                  {mission.colleague.fullname}
                </span>
              </div>
              {mission.colleague.telephone && (
                <a
                  href={`tel:${mission.colleague.telephone}`}
                  className="flex justify-between"
                >
                  <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.phone')}</span>
                  <span className="text-sm font-medium" style={{ color: colors.PRIMARY }}>{mission.colleague.telephone}</span>
                </a>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.solo')}</p>
          )}
        </div>

        {/* Confirmation */}
        <div className="rounded-2xl border px-5 py-4 space-y-3" style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}>
          <h3 className="text-base font-bold mb-1" style={{ color: colors.TEXT_PRIMARY }}>
            {t('screens.planning.confirmationStatus')}
          </h3>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.yourConfirmation')}</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-lg"
              style={{
                backgroundColor: mission.user_confirmed ? colors.SUCCESS + '22' : colors.TEXT_SECONDARY + '22',
                color: mission.user_confirmed ? colors.SUCCESS : colors.TEXT_SECONDARY,
              }}
            >
              {mission.user_confirmed ? t('screens.planning.confirmed') : t('screens.planning.pending')}
            </span>
          </div>
          {mission.colleague && (
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{t('screens.planning.colleagueConfirmation')}</span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-lg"
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

      {/* Bottom actions */}
      <div className="flex gap-3 px-5 py-4 border-t" style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}>
        <button
          onClick={() => router.push(`/opening?id=${mission.id}`)}
          className="flex-1 py-3 rounded-xl border text-sm font-semibold"
          style={{ borderColor: colors.BORDER, color: colors.TEXT_PRIMARY }}
        >
          {t('screens.planning.opening')}
        </button>
        <button
          onClick={() => router.push(`/closing?id=${mission.id}`)}
          className="flex-1 py-3 rounded-xl border text-sm font-semibold"
          style={{ borderColor: colors.BORDER, color: colors.TEXT_PRIMARY }}
        >
          {t('screens.planning.closing')}
        </button>
      </div>
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
