import {
  dateIsoToJourSemaineKey,
  toIsoDateString,
  type HeuresSemaine,
} from './parisTime';

export function formatHeureCourte(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return `${h}H${String(min).padStart(2, '0')}`;
}

/** Libellé horaires du jour : `10H00` ou `10H00 – 20H05`. */
export function buildSiteDayHoursLabel(
  heures: HeuresSemaine | undefined,
  date: Date,
): string | null {
  if (!heures) return null;
  const jour = heures[dateIsoToJourSemaineKey(toIsoDateString(date))];
  const ouvre = formatHeureCourte(jour?.ouvre);
  const ferme = formatHeureCourte(jour?.ferme);
  if (ouvre && ferme) return `${ouvre} – ${ferme}`;
  return ouvre ?? ferme ?? null;
}
