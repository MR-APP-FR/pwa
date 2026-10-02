import { ADMIN_VIEW_UI_COOKIE } from './adminView';

/** Après changement de session Auth (login admin, impersonation) : évite coquille beige / UI figée. */
export function navigateFullPage(path: string) {
  window.location.assign(path);
}

/** Cookie non httpOnly posé par `startAdminView` — vue admin CRM active. */
export function isAdminViewUiActive(): boolean {
  if (typeof document === 'undefined') return false;
  const prefix = `${ADMIN_VIEW_UI_COOKIE}=`;
  return document.cookie.split(';').some((part) => part.trim().startsWith(prefix));
}
