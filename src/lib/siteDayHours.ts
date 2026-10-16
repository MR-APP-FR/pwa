import {
  dateIsoToJourSemaineKey,
  type HeuresSemaine,
  type JourSemaineKey,
} from './parisTime';

/** Exception `site_day_hours` : champ null = horaire habituel. */
export interface DayHourOverride {
  ouvre: string | null;
  ferme: string | null;
}

export function dayHourKey(siteId: number, day: string): string {
  return `${siteId}|${day}`;
}

function filled(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null;
  return String(value).trim();
}

/** Remplace `ouvre` / `ferme` du jour si l'exception est renseignée. `double` inchangé. */
export function mergeDayHourOverride(
  heures: HeuresSemaine | null | undefined,
  jourKey: JourSemaineKey,
  override: DayHourOverride | null | undefined,
): HeuresSemaine | null {
  const base = heures ?? null;
  const ouvreOv = filled(override?.ouvre);
  const fermeOv = filled(override?.ferme);
  if (ouvreOv == null && fermeOv == null) return base;
  const next: HeuresSemaine = { ...(base ?? {}) };
  const prev = next[jourKey] ?? {};
  next[jourKey] = {
    ...prev,
    ouvre: ouvreOv ?? prev.ouvre ?? null,
    ferme: fermeOv ?? prev.ferme ?? null,
  };
  return next;
}

export function effectiveHeuresForDate(
  heures: HeuresSemaine | null | undefined,
  dateIso: string,
  override: DayHourOverride | null | undefined,
): HeuresSemaine | null {
  return mergeDayHourOverride(heures, dateIsoToJourSemaineKey(dateIso), override);
}
