/** Cookie httpOnly : jeton HMAC vue admin (émis par Edge `admin-pwa-view`). */
export const ADMIN_VIEW_COOKIE = 'pwa_admin_view';

/** Cookie lisible client : email admin pour le bandeau UI (pas de secret). */
export const ADMIN_VIEW_UI_COOKIE = 'pwa_admin_view_ui';

export const ADMIN_VIEW_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type AdminSwitchableUser = {
  id: number;
  fullname: string;
  login: string;
};
