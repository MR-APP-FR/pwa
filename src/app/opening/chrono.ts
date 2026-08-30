/** Lundi = '1' (dateIsoToJourSemaineKey). Bornes inclusives : 2 min 25 → 2 min 35. */
export const CHRONO_WEEKDAY_KEY = '1';
export const CHRONO_MIN_SECONDS = 2 * 60 + 25;
export const CHRONO_MAX_SECONDS = 2 * 60 + 35;

export function isChronoInExpectedRange(seconds: number): boolean {
  return seconds >= CHRONO_MIN_SECONDS && seconds <= CHRONO_MAX_SECONDS;
}
