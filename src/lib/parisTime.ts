/**
 * Fuseau Europe/Paris, sans dépendance externe (`Intl` seul), porté depuis
 * `admin-desktop-app/lib/utils/paris-calendar.ts` + `terrain-form-deadline.ts`.
 * Nécessaire car `useAppDate.ts` utilise `new Date()` local — cf. CLAUDE.md
 * (divergence timezone PWA/CRM, dette assumée hors de ce fichier).
 */

export const PARIS_TIME_ZONE = 'Europe/Paris';

export type JourSemaineKey = '1' | '2' | '3' | '4' | '5' | '6' | '7';

export type HeuresSemaine = Partial<
  Record<JourSemaineKey, { ouvre?: string | null; double?: string | null } | null>
>;

function parseDateIsoParts(dateIso: string): { y: number; mo: number; d: number } | null {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, mo, d };
}

const parisWallPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function getParisWallParts(utcMs: number) {
  const parts = parisWallPartsFormatter.formatToParts(new Date(utcMs));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    y: pick('year'),
    mo: pick('month'),
    d: pick('day'),
    h: pick('hour'),
    min: pick('minute'),
    s: pick('second'),
  };
}

/** Parties Y/M/D du jour calendaire Europe/Paris correspondant à un instant. */
export function getParisDateIsoParts(instant: Date = new Date()): { y: number; mo: number; d: number } {
  const p = getParisWallParts(instant.getTime());
  return { y: p.y, mo: p.mo, d: p.d };
}

/**
 * `Date` locale (au sens `getFullYear`/`getMonth`/`getDate`/`getDay`) dont les
 * champs Y/M/D correspondent au jour calendaire Europe/Paris de `instant`.
 * Permet de réutiliser tel quel du code existant qui lit ces getters sans
 * changer son fuseau interne — cf. audit 2026-08-18 §3.5 (dérive PWA/CRM).
 */
export function toParisLocalDate(instant: Date = new Date()): Date {
  const { y, mo, d } = getParisDateIsoParts(instant);
  return new Date(y, mo - 1, d);
}

/**
 * Parse une date ISO `YYYY-MM-DD` en `Date` locale à minuit — jamais
 * `new Date(dateIso)`, qui parse en UTC et peut faire glisser le jour d'un
 * cran selon le fuseau du runtime.
 */
export function parseIsoDateAsLocalDate(dateIso: string): Date {
  const parsed = parseDateIsoParts(dateIso);
  if (!parsed) return toParisLocalDate();
  return new Date(parsed.y, parsed.mo - 1, parsed.d);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `Date` locale (Y/M/D déjà corrects, cf. `toParisLocalDate`) -> `YYYY-MM-DD`. */
export function toIsoDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Instant UTC correspondant à une heure murale Europe/Paris sur le jour `dateIso` (YYYY-MM-DD). */
export function parisWallClockToDate(
  dateIso: string,
  clock: { hour: number; minute: number; second?: number },
): Date | null {
  const parsed = parseDateIsoParts(dateIso);
  if (!parsed) return null;
  const { y, mo, d } = parsed;
  const { hour, minute, second = 0 } = clock;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;

  let utc = Date.UTC(y, mo - 1, d, hour, minute, second);
  const target = utc;

  for (let i = 0; i < 4; i++) {
    const p = getParisWallParts(utc);
    const actual = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.min, p.s);
    const diff = target - actual;
    if (diff === 0) break;
    utc += diff;
  }

  return new Date(utc);
}

/** Échéance fermeture commune 20h05 Europe/Paris sur `dateIso`. */
export function closingDeadlineParisFromDateIso(dateIso: string): Date | null {
  return parisWallClockToDate(dateIso, { hour: 20, minute: 5, second: 0 });
}

export function formatParisTime(value: Date): string {
  return value.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PARIS_TIME_ZONE,
  });
}

/** Heure courante (Paris) 0-23, pour les bandeaux « après-midi ». */
export function getParisHour(date: Date = new Date()): number {
  const parts = parisWallPartsFormatter.formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
}

/** Lundi = '1' … dimanche = '7', pour le jour calendaire Europe/Paris de `dateIso`. */
export function dateIsoToJourSemaineKey(dateIso: string): JourSemaineKey {
  const parsed = parseDateIsoParts(dateIso);
  if (!parsed) return '1';
  // Midi UTC pour éviter tout risque de bascule de jour lié au fuseau.
  const d = new Date(Date.UTC(parsed.y, parsed.mo - 1, parsed.d, 12, 0, 0));
  const js = d.getUTCDay();
  const idx = js === 0 ? 7 : js;
  return String(idx) as JourSemaineKey;
}

/** Heure d'ouverture (`ouvre`) pour le jour calendaire `dateIso`, en Europe/Paris. */
export function openingDeadlineParisFromDateIso(
  dateIso: string,
  ouvreRaw: string | null | undefined,
): Date | null {
  if (ouvreRaw == null || String(ouvreRaw).trim() === '') return null;
  const m = String(ouvreRaw).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return parisWallClockToDate(dateIso, { hour: h, minute: min, second: 0 });
}

/** Heure d'ouverture attendue du site pour `dateIso`, dérivée de `site_infos.heures_semaine`. */
export function getExpectedOpeningDeadline(
  dateIso: string,
  heures: HeuresSemaine | null,
): Date | null {
  if (!heures) return null;
  const key = dateIsoToJourSemaineKey(dateIso);
  const jour = heures[key];
  return openingDeadlineParisFromDateIso(dateIso, jour?.ouvre ?? null);
}
