import { LOGO } from '../../constants/colors';
import type { CrowdLevel, SiteWeather, WeatherCondition } from '../../database/types';
import i18n from '../../i18n/i18n';
import catalog from './encourageMessages.fr.json';

type Translate = (key: string, options?: Record<string, string>) => string;

type EncourageTag =
  | WeatherCondition
  | CrowdLevel
  | 'heat'
  | 'cold'
  | 'monday'
  | 'wednesday'
  | 'friday'
  | 'saturday'
  | 'sunday'
  | 'weekend'
  | 'school_holiday'
  | 'holiday'
  | 'bridge'
  | 'payday'
  | 'month_end'
  | 'christmas'
  | 'black_friday'
  | 'soldes'
  | 'valentine'
  | 'halloween'
  | 'mothers_day'
  | 'back_to_school'
  | 'summer';

interface EncourageMessage {
  id: string;
  tags: EncourageTag[];
  text: string;
}

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

const MESSAGES = catalog.messages as EncourageMessage[];

const WEEKDAY_TAG: Record<number, EncourageTag | null> = {
  0: 'sunday',
  1: 'monday',
  2: null,
  3: 'wednesday',
  4: null,
  5: 'friday',
  6: 'saturday',
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

function parseDateParts(dateIso: string): { y: number; mo: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** 0 = dimanche … 6 = samedi (date calendaire ISO). */
function isoWeekdaySun0(dateIso: string): number {
  const parts = parseDateParts(dateIso);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.y, parts.mo - 1, parts.d, 12, 0, 0)).getUTCDay();
}

function lastWeekdayOfMonth(year: number, month1to12: number, weekdaySun0: number): number {
  const lastDay = new Date(Date.UTC(year, month1to12, 0, 12, 0, 0)).getUTCDate();
  for (let d = lastDay; d >= 1; d -= 1) {
    if (new Date(Date.UTC(year, month1to12 - 1, d, 12, 0, 0)).getUTCDay() === weekdaySun0) {
      return d;
    }
  }
  return lastDay;
}

function inInclusiveRange(dateIso: string, startMd: string, endMd: string): boolean {
  const parts = parseDateParts(dateIso);
  if (!parts) return false;
  const md = `${String(parts.mo).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  if (startMd <= endMd) return md >= startMd && md <= endMd;
  return md >= startMd || md <= endMd;
}

function isBlackFridayWindow(dateIso: string): boolean {
  const parts = parseDateParts(dateIso);
  if (!parts || parts.mo !== 11) return false;
  const friday = lastWeekdayOfMonth(parts.y, 11, 5);
  return parts.d >= friday - 1 && parts.d <= friday + 2;
}

function isMothersDayWindow(dateIso: string): boolean {
  const parts = parseDateParts(dateIso);
  if (!parts || parts.mo !== 5) return false;
  const sunday = lastWeekdayOfMonth(parts.y, 5, 0);
  return parts.d >= sunday - 2 && parts.d <= sunday;
}

function seasonTags(dateIso: string): EncourageTag[] {
  const parts = parseDateParts(dateIso);
  if (!parts) return [];
  const tags: EncourageTag[] = [];
  if (inInclusiveRange(dateIso, '12-01', '12-24')) tags.push('christmas');
  if (isBlackFridayWindow(dateIso)) tags.push('black_friday');
  if (inInclusiveRange(dateIso, '01-08', '02-05') || inInclusiveRange(dateIso, '06-25', '08-05')) {
    tags.push('soldes');
  }
  if (inInclusiveRange(dateIso, '02-10', '02-14')) tags.push('valentine');
  if (inInclusiveRange(dateIso, '10-25', '10-31')) tags.push('halloween');
  if (isMothersDayWindow(dateIso)) tags.push('mothers_day');
  if (inInclusiveRange(dateIso, '08-25', '09-15')) tags.push('back_to_school');
  if (parts.mo >= 6 && parts.mo <= 8) tags.push('summer');
  return tags;
}

/** Tags actifs du jour (météo + calendrier + saison). */
export function weatherEncourageTags(weather: SiteWeather): Set<EncourageTag> {
  const tags = new Set<EncourageTag>([weather.condition]);
  if (weather.crowd_level) tags.add(weather.crowd_level);

  const tempMax = weather.temp_max;
  if (tempMax != null && tempMax >= 28) tags.add('heat');
  if (tempMax != null && tempMax <= 8) tags.add('cold');

  const weekday = isoWeekdaySun0(weather.date);
  const dayTag = WEEKDAY_TAG[weekday];
  if (dayTag) tags.add(dayTag);
  if (weather.is_weekend || weekday === 0 || weekday === 6) tags.add('weekend');

  if (weather.is_school_holiday) tags.add('school_holiday');
  if (weather.is_holiday) tags.add('holiday');
  if (weather.is_bridge) tags.add('bridge');

  const parts = parseDateParts(weather.date);
  if (parts) {
    if (parts.d <= 5) tags.add('payday');
    if (parts.d >= 26) tags.add('month_end');
  }

  for (const tag of seasonTags(weather.date)) tags.add(tag);
  return tags;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickEncourageMessage(weather: SiteWeather): EncourageMessage | null {
  const active = weatherEncourageTags(weather);
  const matching = MESSAGES.filter((msg) => msg.tags.every((tag) => active.has(tag)));
  if (matching.length === 0) return null;

  let bestScore = -1;
  const top: EncourageMessage[] = [];
  for (const msg of matching) {
    const score = msg.tags.length;
    if (score > bestScore) {
      bestScore = score;
      top.length = 0;
      top.push(msg);
    } else if (score === bestScore) {
      top.push(msg);
    }
  }

  const seed = hashSeed(`${weather.date}|${weather.site_id}|encourage`);
  return top[seed % top.length] ?? null;
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
  if (i18n.locale !== 'en') {
    const picked = pickEncourageMessage(weather);
    if (picked) return picked.text;
  }
  return t(messageKey(weather.condition, weather.crowd_level));
}
