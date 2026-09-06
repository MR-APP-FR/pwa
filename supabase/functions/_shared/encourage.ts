/**
 * Brief météo encourageant — logique partagée Edge (catalogue FR tagué).
 * Aligner avec pwa/src/lib/weather/encourageCopy.ts (seed date|site_id).
 */
import catalog from "./encourageMessages.fr.json" with { type: "json" };

export type WeatherCondition = "rain" | "normal" | "sun" | "snow";
export type CrowdLevel = "busy" | "quiet" | "typical";

export interface WeatherBriefInput {
  site_id: number;
  date: string;
  condition: WeatherCondition;
  temp_min: number | null;
  temp_max: number | null;
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name: string | null;
  is_bridge: boolean;
  is_school_holiday: boolean;
  crowd_level: CrowdLevel | null;
}

type EncourageTag =
  | WeatherCondition
  | CrowdLevel
  | "heat"
  | "cold"
  | "monday"
  | "wednesday"
  | "friday"
  | "saturday"
  | "sunday"
  | "weekend"
  | "school_holiday"
  | "holiday"
  | "bridge"
  | "payday"
  | "month_end"
  | "christmas"
  | "black_friday"
  | "soldes"
  | "valentine"
  | "halloween"
  | "mothers_day"
  | "back_to_school"
  | "summer";

interface EncourageMessage {
  id: string;
  tags: EncourageTag[];
  text: string;
}

const MESSAGES = catalog.messages as EncourageMessage[];

const SKY_LABEL_FR: Record<WeatherCondition, string> = {
  sun: "Soleil",
  rain: "Pluie",
  snow: "Neige",
  normal: "Couvert",
};

const WEEKDAY_TAG: Record<number, EncourageTag | null> = {
  0: "sunday",
  1: "monday",
  2: null,
  3: "wednesday",
  4: null,
  5: "friday",
  6: "saturday",
};

const FALLBACK_BODY: Record<WeatherCondition, string> = {
  sun: "Bonjour !\nLe beau temps devrait mettre tout le monde de bonne humeur. À nous d'en faire une belle journée 😎💪",
  rain: "Bonjour 👋\nLa pluie peut changer le rythme aujourd'hui. Chaque client compte : sois dynamique et force de proposition ☔",
  snow: "Bonjour ❄️\nIl neige. Ceux qui viennent sont motivés : sourire, proposer, tout donner !",
  normal: "Bonjour 👋\nTemps couvert, mais rien n'empêche une belle journée : accueil, propositions, énergie 🌤️",
};

function formatTemp(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return String(Math.round(value));
}

function parseDateParts(dateIso: string): { y: number; mo: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

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
  const md = `${String(parts.mo).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
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
  if (inInclusiveRange(dateIso, "12-01", "12-24")) tags.push("christmas");
  if (isBlackFridayWindow(dateIso)) tags.push("black_friday");
  if (inInclusiveRange(dateIso, "01-08", "02-05") || inInclusiveRange(dateIso, "06-25", "08-05")) {
    tags.push("soldes");
  }
  if (inInclusiveRange(dateIso, "02-10", "02-14")) tags.push("valentine");
  if (inInclusiveRange(dateIso, "10-25", "10-31")) tags.push("halloween");
  if (isMothersDayWindow(dateIso)) tags.push("mothers_day");
  if (inInclusiveRange(dateIso, "08-25", "09-15")) tags.push("back_to_school");
  if (parts.mo >= 6 && parts.mo <= 8) tags.push("summer");
  return tags;
}

function weatherEncourageTags(weather: WeatherBriefInput): Set<EncourageTag> {
  const tags = new Set<EncourageTag>([weather.condition]);
  if (weather.crowd_level) tags.add(weather.crowd_level);

  const tempMax = weather.temp_max;
  if (tempMax != null && tempMax >= 28) tags.add("heat");
  if (tempMax != null && tempMax <= 8) tags.add("cold");

  const weekday = isoWeekdaySun0(weather.date);
  const dayTag = WEEKDAY_TAG[weekday];
  if (dayTag) tags.add(dayTag);
  if (weather.is_weekend || weekday === 0 || weekday === 6) tags.add("weekend");

  if (weather.is_school_holiday) tags.add("school_holiday");
  if (weather.is_holiday) tags.add("holiday");
  if (weather.is_bridge) tags.add("bridge");

  const parts = parseDateParts(weather.date);
  if (parts) {
    if (parts.d <= 5) tags.add("payday");
    if (parts.d >= 26) tags.add("month_end");
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

function pickEncourageMessage(weather: WeatherBriefInput): EncourageMessage | null {
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

export function weatherBriefTitleFr(weather: WeatherBriefInput): string {
  const chips: string[] = [SKY_LABEL_FR[weather.condition] ?? SKY_LABEL_FR.normal];
  if (weather.is_holiday) chips.push(weather.holiday_name?.trim() || "Férié");
  else if (weather.is_bridge) chips.push("Pont");
  if (weather.is_weekend) chips.push("Week-end");
  if (weather.is_school_holiday) chips.push("Vacances");

  const min = formatTemp(weather.temp_min);
  const max = formatTemp(weather.temp_max);
  if (min != null && max != null) chips.push(`${min}° / ${max}°`);
  else if (min != null) chips.push(`${min}°`);

  return chips.join(" · ");
}

export function weatherBriefBodyFr(weather: WeatherBriefInput): string {
  const picked = pickEncourageMessage(weather);
  if (picked) return picked.text;
  return FALLBACK_BODY[weather.condition] ?? FALLBACK_BODY.normal;
}

export function truncatePushBody(text: string, max = 140): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
