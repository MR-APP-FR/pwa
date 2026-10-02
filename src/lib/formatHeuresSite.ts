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

/**
 * Heure de début affichée pour une affectation.
 * Teneur : `ouvre`. Double : `double` si renseigné, sinon `ouvre`.
 */
export function dayStartRawForRole(
  jour: { ouvre?: string | null; double?: string | null } | null | undefined,
  isDouble: boolean,
): string | null {
  if (!jour) return null;
  if (isDouble) {
    const d = jour.double;
    if (d != null && String(d).trim() !== '') return String(d).trim();
  }
  const o = jour.ouvre;
  if (o != null && String(o).trim() !== '') return String(o).trim();
  return null;
}

/** Libellé horaires du jour : `10H00` ou `10H00 – 20H05` (double → `13H00 – …`). */
export function buildSiteDayHoursLabel(
  heures: HeuresSemaine | undefined,
  date: Date,
  opts?: { isDouble?: boolean },
): string | null {
  if (!heures) return null;
  const jour = heures[dateIsoToJourSemaineKey(toIsoDateString(date))];
  const start = formatHeureCourte(dayStartRawForRole(jour, opts?.isDouble === true));
  const ferme = formatHeureCourte(jour?.ferme);
  if (start && ferme) return `${start} – ${ferme}`;
  return start ?? ferme ?? null;
}
