import { LOGO } from '../../constants/colors';
import type { CrowdLevel, SiteWeather, WeatherCondition } from '../../database/types';

type Translate = (key: string, options?: Record<string, string>) => string;

export const WEATHER_CONDITION_STYLE: Record<WeatherCondition, { bg: string; fg: string }> = {
  sun: { bg: LOGO.yellowMuted, fg: '#8A6D00' },
  rain: { bg: LOGO.blueMuted, fg: LOGO.blue },
  snow: { bg: LOGO.blueMuted, fg: LOGO.blue },
  normal: { bg: '#EFEEEB', fg: '#6E6A66' },
};

export const WEATHER_CONDITION_EMOJI: Record<WeatherCondition, string> = {
  sun: '☀️',
  rain: '🌧️',
  snow: '❄️',
  normal: '⛅️',
};

const SKY_LABEL: Record<WeatherCondition, string> = {
  sun: 'screens.home.weatherSunLabel',
  rain: 'screens.home.weatherRainLabel',
  snow: 'screens.home.weatherSnowLabel',
  normal: 'screens.home.weatherNormalLabel',
};

function formatTemp(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return String(Math.round(value));
}

function skyKey(condition: WeatherCondition): 'Sun' | 'Rain' | 'Snow' | 'Normal' {
  if (condition === 'sun') return 'Sun';
  if (condition === 'rain') return 'Rain';
  if (condition === 'snow') return 'Snow';
  return 'Normal';
}

function messageKey(condition: WeatherCondition, crowd: CrowdLevel | null): string {
  const sky = skyKey(condition);
  if (crowd === 'busy') return `screens.home.weatherEncourageBusy${sky}`;
  if (crowd === 'quiet') return `screens.home.weatherEncourageQuiet${sky}`;
  return `screens.home.weatherEncourage${sky}`;
}

function contextChips(weather: SiteWeather, t: Translate): string[] {
  const chips: string[] = [];
  if (weather.is_holiday) chips.push(weather.holiday_name?.trim() || t('screens.home.weatherHoliday'));
  else if (weather.is_bridge) chips.push(t('screens.home.weatherBridge'));
  if (weather.is_weekend) chips.push(t('screens.home.weatherWeekend'));
  if (weather.is_school_holiday) chips.push(t('screens.home.weatherSchoolHoliday'));
  return chips;
}

export function weatherConditionStyle(condition: WeatherCondition) {
  return WEATHER_CONDITION_STYLE[condition] ?? WEATHER_CONDITION_STYLE.normal;
}

export function weatherConditionEmoji(condition: WeatherCondition): string {
  return WEATHER_CONDITION_EMOJI[condition] ?? WEATHER_CONDITION_EMOJI.normal;
}

export function weatherBriefTitle(weather: SiteWeather, t: Translate): string {
  const min = formatTemp(weather.temp_min);
  const max = formatTemp(weather.temp_max);
  const tempLabel =
    min != null && max != null
      ? t('screens.home.weatherTempRange', { min, max })
      : min != null
        ? t('screens.home.weatherTempSingle', { temp: min })
        : null;

  return [
    t(SKY_LABEL[weather.condition] ?? SKY_LABEL.normal),
    ...contextChips(weather, t),
    tempLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function weatherBriefBody(weather: SiteWeather, t: Translate): string {
  return t(messageKey(weather.condition, weather.crowd_level));
}
