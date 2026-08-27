import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const DAILY_VARS =
  "weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,sunshine_duration";
const FORECAST_CHUNK = 8;
const ARCHIVE_CHUNK = 2;
const ARCHIVE_LAG_DAYS = 5;
const ARCHIVE_REFRESH_DAYS = 10;
const FORECAST_DAYS = 3;
const PAGE = 1000;
const UPSERT_CHUNK = 500;
const QUIET_BELOW = 50;
const BUSY_FROM = 150;

type WeatherCondition = "rain" | "normal" | "sun" | "snow";
type CrowdLevel = "busy" | "quiet" | "typical";
type WeatherSource = "forecast" | "archive";

type SiteCoords = { id: number; latitude: number; longitude: number };
type DayMetrics = { total: number; total_cb: number; total_confiserie: number; enfants: number };

const HOLIDAY_MD: Record<string, string> = {
  "01-01": "Jour de l'an",
  "05-01": "Fête du travail",
  "05-08": "Victoire 1945",
  "07-14": "Fête nationale",
  "08-15": "Assomption",
  "11-01": "Toussaint",
  "11-11": "Armistice",
  "12-25": "Noël",
};

const SCHOOL_RANGES: [string, string][] = [
  ["2023-07-08", "2023-09-03"],
  ["2023-10-21", "2023-11-05"],
  ["2023-12-23", "2024-01-07"],
  ["2024-02-10", "2024-03-10"],
  ["2024-04-06", "2024-05-05"],
  ["2024-07-06", "2024-09-01"],
  ["2024-10-19", "2024-11-03"],
  ["2024-12-21", "2025-01-05"],
  ["2025-02-08", "2025-03-09"],
  ["2025-04-05", "2025-05-04"],
  ["2025-07-05", "2025-08-31"],
  ["2025-10-18", "2025-11-02"],
  ["2025-12-20", "2026-01-04"],
  ["2026-02-07", "2026-03-08"],
  ["2026-04-04", "2026-05-03"],
  ["2026-07-04", "2026-08-31"],
  ["2026-10-17", "2026-11-01"],
  ["2026-12-19", "2027-01-03"],
  ["2027-02-06", "2027-03-07"],
  ["2027-04-10", "2027-05-09"],
  ["2027-07-03", "2027-08-31"],
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseIso(dateIso: string) {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function toIso(y: number, mo: number, d: number) {
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

function shiftDateIso(dateIso: string, delta: number) {
  const p = parseIso(dateIso);
  if (!p) return dateIso;
  const next = new Date(Date.UTC(p.y, p.mo - 1, p.d + delta));
  return toIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function parisTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function isSnow(code: number | null | undefined) {
  if (code == null) return false;
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

function classifyWeather(input: {
  weatherCode: number;
  precipitationMm: number;
  sunshineHours: number | null;
  tempMax: number | null;
}): WeatherCondition {
  const precip = input.precipitationMm;
  const sunH = input.sunshineHours ?? 0;
  if (isSnow(input.weatherCode)) return "snow";
  if (precip >= 2 || input.weatherCode >= 61) return "rain";
  if (precip < 1 && (sunH >= 6 || (input.tempMax != null && input.tempMax >= 22))) return "sun";
  if (precip < 1 && input.weatherCode <= 1) return "sun";
  return "normal";
}

function easterSundayIso(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(year, month, day);
}

function holidaysForYear(year: number) {
  const map = new Map<string, string>();
  for (const [md, name] of Object.entries(HOLIDAY_MD)) map.set(`${year}-${md}`, name);
  const easter = easterSundayIso(year);
  map.set(shiftDateIso(easter, 1), "Lundi de Pâques");
  map.set(shiftDateIso(easter, 39), "Ascension");
  map.set(shiftDateIso(easter, 50), "Lundi de Pentecôte");
  return map;
}

function holidayNameOn(dateIso: string) {
  const p = parseIso(dateIso);
  if (!p) return null;
  return holidaysForYear(p.y).get(dateIso) ?? null;
}

function isoWeekdaySun0(dateIso: string) {
  const p = parseIso(dateIso);
  if (!p) return 0;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, 12, 0, 0)).getUTCDay();
}

function frenchDayContext(dateIso: string) {
  const p = parseIso(dateIso);
  if (!p) {
    return {
      isWeekend: false,
      isHoliday: false,
      holidayName: null as string | null,
      isBridge: false,
      isSchoolHoliday: false,
    };
  }
  const dow = isoWeekdaySun0(dateIso);
  const isWeekend = dow === 0 || dow === 6;
  const name = holidayNameOn(dateIso);
  const isHoliday = name != null;
  let isBridge = false;
  if (!isWeekend && !isHoliday) {
    if (dow === 5 && holidayNameOn(shiftDateIso(dateIso, -1))) isBridge = true;
    if (dow === 1 && holidayNameOn(shiftDateIso(dateIso, 1))) isBridge = true;
  }
  return {
    isWeekend,
    isHoliday,
    holidayName: name,
    isBridge,
    isSchoolHoliday: SCHOOL_RANGES.some(([s, e]) => dateIso >= s && dateIso <= e),
  };
}

function round1(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function sameCalendarDate(dateIso: string, yearDelta: number) {
  const p = parseIso(dateIso);
  if (!p) return null;
  const year = p.y + yearDelta;
  const probe = new Date(Date.UTC(year, p.mo - 1, p.d, 12, 0, 0));
  if (probe.getUTCMonth() !== p.mo - 1 || probe.getUTCDate() !== p.d) return null;
  return toIso(year, p.mo, p.d);
}

function comparableDates(dateIso: string) {
  return {
    weeks: [
      shiftDateIso(dateIso, -28),
      shiftDateIso(dateIso, -21),
      shiftDateIso(dateIso, -14),
      shiftDateIso(dateIso, -7),
    ],
    lastYear: sameCalendarDate(dateIso, -1),
    yearBefore: sameCalendarDate(dateIso, -2),
  };
}

function hasMetrics(row: DayMetrics | null | undefined): row is DayMetrics {
  return !!row && (row.enfants > 0 || row.total > 0);
}

function meanMetrics(rows: DayMetrics[]): DayMetrics {
  const n = rows.length;
  return {
    total: Math.round(rows.reduce((s, r) => s + r.total, 0) / n),
    total_cb: Math.round(rows.reduce((s, r) => s + r.total_cb, 0) / n),
    total_confiserie: Math.round(rows.reduce((s, r) => s + r.total_confiserie, 0) / n),
    enfants: Math.round((rows.reduce((s, r) => s + r.enfants, 0) / n) * 10) / 10,
  };
}

function computeBaseline(dateIso: string, lookup: (iso: string) => DayMetrics | null) {
  const dates = comparableDates(dateIso);
  const weekRows = dates.weeks.map(lookup).filter(hasMetrics);
  const lastYear = dates.lastYear ? lookup(dates.lastYear) : null;
  const yearBefore = dates.yearBefore ? lookup(dates.yearBefore) : null;
  const points: DayMetrics[] = [...weekRows];
  if (hasMetrics(lastYear)) points.push(lastYear);
  if (hasMetrics(yearBefore)) points.push(yearBefore);
  return {
    avg4: weekRows.length > 0 ? meanMetrics(weekRows) : null,
    avg4n: weekRows.length,
    lastYear: hasMetrics(lastYear) ? lastYear : null,
    yearBefore: hasMetrics(yearBefore) ? yearBefore : null,
    expected: points.length > 0 ? meanMetrics(points) : null,
    sampleCount: points.length,
  };
}

function classifyCrowd(expected: number | null): CrowdLevel {
  if (expected == null || !Number.isFinite(expected)) return "typical";
  if (expected >= BUSY_FROM) return "busy";
  if (expected < QUIET_BELOW) return "quiet";
  return "typical";
}

function recastCondition(condition: WeatherCondition, weatherCode: number | null): WeatherCondition {
  if (isSnow(weatherCode)) return "snow";
  if (condition === "snow" && !isSnow(weatherCode)) return "rain";
  return condition;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type OpenMeteoDaily = {
  time: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  temperature_2m_mean?: (number | null)[];
  precipitation_sum?: (number | null)[];
  sunshine_duration?: (number | null)[];
};

type WeatherRow = {
  site_id: number;
  date: string;
  condition: WeatherCondition;
  temp_min: number | null;
  temp_max: number | null;
  temp_mean: number | null;
  precipitation_mm: number | null;
  sunshine_hours: number | null;
  weather_code: number;
  source: WeatherSource;
  fetched_at: string;
};

function toRows(site: SiteCoords, daily: OpenMeteoDaily, source: WeatherSource, fetchedAt: string) {
  const rows: WeatherRow[] = [];
  const days = daily.time ?? [];
  for (let i = 0; i < days.length; i++) {
    const code = daily.weather_code?.[i];
    const precip = daily.precipitation_sum?.[i];
    if (code == null && precip == null) continue;
    const weatherCode = code ?? 2;
    const precipitationMm = precip ?? 0;
    const tempMin = round1(daily.temperature_2m_min?.[i]);
    const tempMax = round1(daily.temperature_2m_max?.[i]);
    const tempMeanRaw = daily.temperature_2m_mean?.[i];
    const tempMean =
      round1(tempMeanRaw) ?? (tempMin != null && tempMax != null ? round1((tempMin + tempMax) / 2) : null);
    const sunshineSec = daily.sunshine_duration?.[i];
    const sunshineHours = sunshineSec == null ? null : round1(sunshineSec / 3600);
    rows.push({
      site_id: site.id,
      date: days[i],
      condition: classifyWeather({ weatherCode, precipitationMm, sunshineHours, tempMax }),
      temp_min: tempMin,
      temp_max: tempMax,
      temp_mean: tempMean,
      precipitation_mm: round1(precipitationMm),
      sunshine_hours: sunshineHours,
      weather_code: weatherCode,
      source,
      fetched_at: fetchedAt,
    });
  }
  return rows;
}

async function fetchOpenMeteo(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ravoire-maneges-weather/edge" },
    });
    if (response.status === 429) {
      await sleep(2000);
      continue;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Open-Meteo ${response.status}: ${body.slice(0, 200)}`);
    }
    return await response.json();
  }
  throw new Error("Open-Meteo: trop de 429");
}

async function fetchChunk(sites: SiteCoords[], source: WeatherSource, extra: string) {
  const base = source === "archive" ? ARCHIVE_URL : FORECAST_URL;
  const url =
    `${base}?latitude=${sites.map((s) => s.latitude).join(",")}` +
    `&longitude=${sites.map((s) => s.longitude).join(",")}` +
    `&daily=${DAILY_VARS}&timezone=Europe%2FParis&${extra}`;
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  try {
    const payload = await fetchOpenMeteo(url);
    const locations = Array.isArray(payload) ? payload : [payload];
    const rows: WeatherRow[] = [];
    for (let i = 0; i < sites.length; i++) {
      const loc = locations[i];
      if (!loc?.daily) {
        errors.push(`site ${sites[i].id}: pas de daily`);
        continue;
      }
      if (loc.error) {
        errors.push(`site ${sites[i].id}: ${loc.reason ?? "erreur Open-Meteo"}`);
        continue;
      }
      rows.push(...toRows(sites[i], loc.daily, source, fetchedAt));
    }
    return { rows, errors };
  } catch (err) {
    return { rows: [] as WeatherRow[], errors: [`chunk: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

async function fetchWeather(sites: SiteCoords[], source: WeatherSource, extra: string) {
  const rows: WeatherRow[] = [];
  const errors: string[] = [];
  const groups = chunk(sites, source === "archive" ? ARCHIVE_CHUNK : FORECAST_CHUNK);
  for (let i = 0; i < groups.length; i++) {
    if (i > 0) await sleep(source === "archive" ? 800 : 200);
    const result = await fetchChunk(groups[i], source, extra);
    rows.push(...result.rows);
    errors.push(...result.errors);
  }
  return { rows, errors };
}

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing supabase env" }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    const { data: siteRows, error: siteErr } = await supabase
      .from("site")
      .select("id, latitude, longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    if (siteErr) throw siteErr;

    const sites: SiteCoords[] = [];
    for (const row of siteRows ?? []) {
      if (row.latitude == null || row.longitude == null) continue;
      sites.push({ id: Number(row.id), latitude: Number(row.latitude), longitude: Number(row.longitude) });
    }
    if (sites.length === 0) return Response.json({ ok: true, sites: 0, upserted: 0 });

    const today = parisTodayIso();
    const forecastStart = shiftDateIso(today, -(ARCHIVE_LAG_DAYS - 1));
    const forecastEnd = shiftDateIso(today, FORECAST_DAYS - 1);
    const archiveEnd = shiftDateIso(today, -ARCHIVE_LAG_DAYS);
    const archiveStart = shiftDateIso(today, -ARCHIVE_REFRESH_DAYS);

    const errors: string[] = [];
    let upserted = 0;

    const forecast = await fetchWeather(sites, "forecast", `start_date=${forecastStart}&end_date=${forecastEnd}`);
    errors.push(...forecast.errors);
    for (let i = 0; i < forecast.rows.length; i += UPSERT_CHUNK) {
      const chunkRows = forecast.rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase.from("site_weather").upsert(chunkRows, { onConflict: "site_id,date" });
      if (error) throw error;
      upserted += chunkRows.length;
    }

    const archive = await fetchWeather(sites, "archive", `start_date=${archiveStart}&end_date=${archiveEnd}`);
    errors.push(...archive.errors);
    for (let i = 0; i < archive.rows.length; i += UPSERT_CHUNK) {
      const chunkRows = archive.rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase.from("site_weather").upsert(chunkRows, { onConflict: "site_id,date" });
      if (error) throw error;
      upserted += chunkRows.length;
    }

    const fromDate = archiveStart;
    const toDate = forecastEnd;
    let weatherRows: {
      site_id: number;
      date: string;
      condition: WeatherCondition;
      weather_code: number | null;
      source: WeatherSource;
    }[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("site_weather")
        .select("site_id, date, condition, weather_code, source")
        .gte("date", fromDate)
        .lte("date", toDate)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data ?? [];
      weatherRows = weatherRows.concat(rows as typeof weatherRows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    const raw = await fetchAll<{
      site_id: number;
      year: number;
      month: number;
      day: number;
      enfants: number | null;
      total: number | null;
      cb: number | null;
      confiserie: number | null;
    }>(supabase, "data", "site_id, year, month, day, enfants, total, cb, confiserie");

    const metrics = new Map<string, DayMetrics>();
    const siteIds = new Set<number>();
    for (const row of raw) {
      const dateIso = toIso(row.year, row.month, row.day);
      siteIds.add(row.site_id);
      metrics.set(`${row.site_id}|${dateIso}`, {
        total: Number(row.total) || 0,
        total_cb: Number(row.cb) || 0,
        total_confiserie: Number(row.confiserie) || 0,
        enfants: Number(row.enfants) || 0,
      });
    }

    const dates = [...new Set(weatherRows.map((row) => String(row.date).slice(0, 10)))];
    const baselinePayload: Record<string, unknown>[] = [];
    const computedAt = new Date().toISOString();
    for (const siteId of siteIds) {
      const lookup = (iso: string) => metrics.get(`${siteId}|${iso}`) ?? null;
      for (const dateIso of dates) {
        const base = computeBaseline(dateIso, lookup);
        baselinePayload.push({
          site_id: siteId,
          date: dateIso,
          avg4_enfants: base.avg4?.enfants ?? null,
          avg4_ca: base.avg4?.total ?? null,
          avg4_n: base.avg4n,
          ly_enfants: base.lastYear?.enfants ?? null,
          ly_ca: base.lastYear?.total ?? null,
          y2_enfants: base.yearBefore?.enfants ?? null,
          y2_ca: base.yearBefore?.total ?? null,
          expected_enfants: base.expected?.enfants ?? null,
          expected_ca: base.expected?.total ?? null,
          sample_count: base.sampleCount,
          computed_at: computedAt,
        });
      }
    }

    let baselines = 0;
    for (let i = 0; i < baselinePayload.length; i += UPSERT_CHUNK) {
      const chunkRows = baselinePayload.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase.from("site_day_baseline").upsert(chunkRows, { onConflict: "site_id,date" });
      if (error) throw error;
      baselines += chunkRows.length;
    }

    const payload = weatherRows.map((row) => {
      const dateIso = String(row.date).slice(0, 10);
      const cal = frenchDayContext(dateIso);
      const lookup = (iso: string) => metrics.get(`${row.site_id}|${iso}`) ?? null;
      const base = computeBaseline(dateIso, lookup);
      const expectedEnfants = base.expected?.enfants ?? null;
      return {
        site_id: row.site_id,
        date: dateIso,
        condition: recastCondition(row.condition, row.weather_code),
        source: row.source,
        is_weekend: cal.isWeekend,
        is_holiday: cal.isHoliday,
        holiday_name: cal.holidayName,
        is_bridge: cal.isBridge,
        is_school_holiday: cal.isSchoolHoliday,
        crowd_level: classifyCrowd(expectedEnfants),
        crowd_enfants_avg: expectedEnfants,
        crowd_sample_count: base.sampleCount,
      };
    });

    let enriched = 0;
    for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
      const chunkRows = payload.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase.from("site_weather").upsert(chunkRows, { onConflict: "site_id,date" });
      if (error) throw error;
      enriched += chunkRows.length;
    }

    return Response.json({
      ok: true,
      sites: sites.length,
      upserted,
      enriched,
      baselines,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
