'use client';

import { useCurrentUser } from './api/useCurrentUser';
import { isMaintenanceRole } from '../lib/staff-role';
import { isPushAttentionNeeded, usePushStatus } from './usePushStatus';

/**
 * Compte les actions profil encore ouvertes : photo, CNI, notifications.
 * Sert de badge sur l'icône paramètres de l'accueil.
 * Mode maintenance : pas de photo/CNI (profil allégé).
 */
function isBlank(value: string | null | undefined): boolean {
  return !value?.trim();
}

export function useSettingsTodoCount(): number {
  const { data } = useCurrentUser();
  const { status } = usePushStatus();
  const isMaintenance = isMaintenanceRole(data?.user.role);

  let count = 0;
  if (data && !isMaintenance) {
    if (isBlank(data.userInfo?.avatar_url)) count += 1;
    if (isBlank(data.userInfo?.cni_url)) count += 1;
  }
  if (isPushAttentionNeeded(status)) count += 1;
  return count;
}
