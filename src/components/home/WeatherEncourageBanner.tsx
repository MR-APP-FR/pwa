'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import {
  weatherBriefBody,
  weatherBriefTitle,
  weatherConditionEmoji,
  weatherConditionStyle,
} from '../../lib/weather/encourageCopy';
import type { SiteWeather } from '../../database/types';

interface WeatherEncourageBannerProps {
  weather: SiteWeather;
}

export function WeatherEncourageBanner({ weather }: WeatherEncourageBannerProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const style = weatherConditionStyle(weather.condition);

  return (
    <div
      className="flex items-start gap-3 px-3.5 py-3"
      style={{
        backgroundColor: style.bg,
        borderRadius: RADIUS.xl,
        border: `1px solid ${colors.BORDER}`,
        boxShadow: colors.CARD_SHADOW,
      }}
    >
      <span className="mt-0.5 shrink-0 text-[22px] leading-none" aria-hidden>
        {weatherConditionEmoji(weather.condition)}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-bold"
          style={{ color: style.fg, fontFamily: 'var(--font-display)' }}
        >
          {weatherBriefTitle(weather, t)}
        </p>
        <p className="mt-0.5 text-sm leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
          {weatherBriefBody(weather, t)}
        </p>
      </div>
    </div>
  );
}
