/** Formulaires : pas de file d'attente hors-ligne (Background Sync = dette). */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
