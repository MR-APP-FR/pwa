/** Rôles métier `public.user.role` (fiche staff CRM). */
export const STAFF_ROLES = {
  teneur: null,
  maintenance: 'maintenance',
} as const;

export type StaffRoleValue = (typeof STAFF_ROLES)[keyof typeof STAFF_ROLES];

export function isMaintenanceRole(role: string | null | undefined): boolean {
  return role === STAFF_ROLES.maintenance;
}
