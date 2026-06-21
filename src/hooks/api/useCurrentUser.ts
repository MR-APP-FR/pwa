'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useProfileStore } from '../../stores/profileStore';
import type { User, UserInfo, UserInfoSiteWithDetails } from '../../database/types';
import { formatSiteName } from '../../lib/formatSiteName';

/**
 * GRE-89.
 *
 * Mode démo : lit le `selectedUserId` du profile switcher (GRE-87) et fetch
 * `public.user` + `public.user_info` + `public.user_info_sites` (joint avec
 * `public.site`) via Supabase. Plus de retour `MOCK_CURRENT_USER` codé en dur.
 *
 * Quand l'auth réelle sera livrée (GRE-88, GRE-90), ce hook lira `auth.getUser()`
 * et résoudra l'employé via le helper SQL `current_employee_id()` (cf. GRE-112).
 */

interface CurrentUserData {
  user: User;
  userInfo: UserInfo | null;
  sites: UserInfoSiteWithDetails[];
}

interface SiteJoinRow {
  id: number | null;
  name: string | null;
  statut: string | null;
  ville: string | null;
  nb_teneur: number | null;
}

interface UserInfoSitesQueryRow {
  id: number;
  user_info_id: number;
  site_id: number;
  created_at: string;
  site: SiteJoinRow | SiteJoinRow[] | null;
}

export function useCurrentUser() {
  const selectedUserId = useProfileStore((s) => s.selectedUserId);

  return useQuery<CurrentUserData | null>({
    queryKey: ['currentUser', selectedUserId],
    enabled: selectedUserId !== null,
    queryFn: async () => {
      if (selectedUserId === null) return null;
      const supabase = createClient();

      const [userRes, userInfoRes] = await Promise.all([
        supabase
          .from('user')
          .select('id, login, email, registered, fullname, role, actif')
          .eq('id', selectedUserId)
          .maybeSingle(),
        supabase
          .from('user_info')
          .select('*')
          .eq('user_id', selectedUserId)
          .maybeSingle(),
      ]);

      if (userRes.error) {
        throw new Error(`useCurrentUser user fetch failed: ${userRes.error.message}`);
      }
      if (!userRes.data) return null;

      if (userInfoRes.error) {
        throw new Error(`useCurrentUser user_info fetch failed: ${userInfoRes.error.message}`);
      }

      let sites: UserInfoSiteWithDetails[] = [];
      if (userInfoRes.data) {
        const sitesRes = await supabase
          .from('user_info_sites')
          .select(
            'id, user_info_id, site_id, created_at, site:site_id(id, name, statut, ville, nb_teneur)',
          )
          .eq('user_info_id', userInfoRes.data.id);

        if (sitesRes.error) {
          throw new Error(
            `useCurrentUser user_info_sites fetch failed: ${sitesRes.error.message}`,
          );
        }

        sites = (sitesRes.data ?? []).map((row) =>
          mapUserInfoSiteRow(row as UserInfoSitesQueryRow),
        );
      }

      return {
        user: mapUserRow(userRes.data),
        userInfo: userInfoRes.data ? mapUserInfoRow(userInfoRes.data) : null,
        sites,
      };
    },
    staleTime: 60 * 1000,
  });
}

function mapUserRow(row: {
  id: number;
  login: string;
  email: string;
  registered: string;
  fullname: string | null;
  role: string | null;
  actif: boolean;
}): User {
  return {
    id: row.id,
    login: row.login,
    email: row.email,
    registered: row.registered,
    fullname: row.fullname ?? '',
    role: row.role,
    actif: row.actif,
  };
}

function mapUserInfoRow(row: Record<string, unknown>): UserInfo {
  return row as unknown as UserInfo;
}

function mapUserInfoSiteRow(row: UserInfoSitesQueryRow): UserInfoSiteWithDetails {
  const site = Array.isArray(row.site) ? row.site[0] : row.site;
  return {
    id: row.id,
    user_info_id: row.user_info_id,
    site_id: row.site_id,
    created_at: row.created_at,
    site_name: formatSiteName(site?.name ?? ''),
    statut: site?.statut ?? '',
    ville: site?.ville ?? '',
    nb_teneur: site?.nb_teneur ?? 0,
  };
}
