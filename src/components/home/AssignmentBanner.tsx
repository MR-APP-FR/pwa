'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import { BottomSheetModal } from '../common/BottomSheetModal';
import { WeatherEncourageBanner } from './WeatherEncourageBanner';
import { weatherConditionEmoji } from '../../lib/weather/encourageCopy';
import type { PlanningWithColleague, SiteWeather } from '../../database/types';
import type { ThemeColors } from '../../types/theme.types';

interface AssignmentBannerProps {
  todayMission: PlanningWithColleague | null;
  nextMission: PlanningWithColleague | null;
  nextDayLabel: string | null;
  todayWeather?: SiteWeather | null;
  onWeatherOpen?: () => void;
}

interface AssignmentCardProps {
  label: string;
  mission: PlanningWithColleague | null;
  accentColor: string;
  accentMuted: string;
  dateLabel?: string | null;
  emptyMessage: string;
  icon: LucideIcon;
  colors: ThemeColors;
  weather?: SiteWeather | null;
  onWeatherPress?: () => void;
  weatherAriaLabel?: string;
}

/** Réduit text-xl → text-base si le titre passe sur 2+ lignes. */
function AssignmentTitle({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Toujours mesurer en taille « xl » pour éviter compact ↔ normal en boucle.
      const prev = el.style.fontSize;
      el.style.fontSize = '1.25rem';
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const singleLine = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20;
      const wraps = el.scrollHeight > singleLine * 1.4;
      el.style.fontSize = prev;
      setCompact(wraps);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <p
      ref={ref}
      className={`font-bold uppercase leading-tight tracking-tight ${compact ? 'text-base' : 'text-xl'}`}
      style={{ color, fontFamily: 'var(--font-display)' }}
    >
      {children}
    </p>
  );
}

function AssignmentCard({
  label,
  mission,
  accentColor,
  accentMuted,
  dateLabel,
  emptyMessage,
  icon: Icon,
  colors,
  weather,
  onWeatherPress,
  weatherAriaLabel,
}: AssignmentCardProps) {
  const href = mission ? `/mission?id=${mission.id}` : null;

  const pin = (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{
        width: 44,
        height: 44,
        borderRadius: RADIUS.sm,
        backgroundColor: accentMuted,
      }}
    >
      <Icon size={22} color={accentColor} strokeWidth={2.25} />
    </div>
  );

  const labelEl = (
    <p
      className="text-sm font-bold uppercase tracking-wide"
      style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
    >
      {label}
    </p>
  );

  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: RADIUS.xl,
        boxShadow: colors.CARD_SHADOW,
        backgroundColor: colors.SETTINGS_SECTION_BG,
        border: `1px solid ${colors.BORDER}`,
      }}
    >
      <div className="flex items-center gap-3 p-4">
        {href ? (
          <Link href={href} className="shrink-0 no-underline transition-opacity active:opacity-80">
            {pin}
          </Link>
        ) : (
          pin
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {href ? (
            <Link href={href} className="no-underline transition-opacity active:opacity-80">
              {labelEl}
            </Link>
          ) : (
            labelEl
          )}
          {mission ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {weather && onWeatherPress && (
                <button
                  type="button"
                  onClick={onWeatherPress}
                  aria-label={weatherAriaLabel}
                  className="flex shrink-0 items-center justify-center text-[22px] leading-none"
                >
                  {weatherConditionEmoji(weather.condition)}
                </button>
              )}
              <Link
                href={`/mission?id=${mission.id}`}
                className="min-w-0 flex-1 no-underline transition-opacity active:opacity-80"
              >
                <AssignmentTitle color={accentColor}>{mission.site_name}</AssignmentTitle>
                {dateLabel && (
                  <p
                    className="mt-0.5 text-base font-bold uppercase leading-tight tracking-tight"
                    style={{ color: accentColor, fontFamily: 'var(--font-display)' }}
                  >
                    {dateLabel}
                  </p>
                )}
              </Link>
            </div>
          ) : (
            <p className="text-base" style={{ color: colors.TEXT_SECONDARY }}>
              {emptyMessage}
            </p>
          )}
        </div>

        {mission && (
          <Link href={`/mission?id=${mission.id}`} className="shrink-0 no-underline" aria-hidden>
            <ChevronRight
              size={22}
              className="opacity-40"
              color={colors.TEXT_SECONDARY}
              strokeWidth={2.5}
            />
          </Link>
        )}
      </div>
    </div>
  );
}

export function AssignmentBanner({
  todayMission,
  nextMission,
  nextDayLabel,
  todayWeather,
  onWeatherOpen,
}: AssignmentBannerProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [weatherOpen, setWeatherOpen] = useState(false);

  function openWeather() {
    setWeatherOpen(true);
    onWeatherOpen?.();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <AssignmentCard
        label={t('screens.home.todayAssignment')}
        mission={todayMission}
        accentColor={colors.ACCENT_RED}
        accentMuted={colors.ACCENT_RED_MUTED}
        emptyMessage={t('screens.home.noAssignmentToday')}
        icon={MapPin}
        colors={colors}
        weather={todayWeather}
        onWeatherPress={todayWeather ? openWeather : undefined}
        weatherAriaLabel={t('screens.home.weatherIconAria')}
      />
      <AssignmentCard
        label={t('screens.home.nextAssignment')}
        mission={nextMission}
        accentColor={colors.ACCENT_BLUE}
        accentMuted={colors.ACCENT_BLUE_MUTED}
        dateLabel={nextDayLabel}
        emptyMessage={t('screens.home.noNextAssignment')}
        icon={CalendarDays}
        colors={colors}
      />

      {todayWeather && (
        <BottomSheetModal
          isOpen={weatherOpen}
          onClose={() => setWeatherOpen(false)}
          colors={colors}
          title={t('screens.home.weatherPopupTitle')}
          titleId="weather-brief-title"
          closeAriaLabel={t('common.cancel')}
          doneLabel={t('screens.home.weatherPopupDone')}
        >
          <WeatherEncourageBanner weather={todayWeather} />
        </BottomSheetModal>
      )}
    </div>
  );
}
