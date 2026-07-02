'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useProfileStore } from '../../stores/profileStore';
import type { PlanningColleague, PlanningSiteDetails, PlanningWithColleague } from '../../database/types';
import { formatSiteName } from '../../lib/formatSiteName';

interface UsePlanningParams {
  year: number;
  month: number;
}

interface PlanningRowDb {
  id: number;
  year: number;
  month: number;
  day: number;
  site_id: number;
  user_id: number | null;
  double_id: number | null;
  user_confirmed: boolean | null;
  double_confirmed: boolean | null;
  site:
    | {
        name: string | null;
        adresse: string | null;
        metro: string | null;
        indication: string | null;
        latitude: number | null;
        longitude: number | null;
      }
    | {
        name: string | null;
        adresse: string | null;
        metro: string | null;
        indication: string | null;
        latitude: number | null;
        longitude: number | null;
      }[]
    | null;
}

interface UserColleagueRow {
  id: number;
  fullname: string | null;
  user_info:
    | {
        first_name: string | null;
        last_name: string | null;
        telephone: string | null;
        couleur: string | null;
      }
    | {
        first_name: string | null;
        last_name: string | null;
        telephone: string | null;
        couleur: string | null;
      }[]
    | null;
}

function planningMonthTriplet(year: number, month: number): { year: number; month: number }[] {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return [prev, { year, month }, next];
}

function normalizeSite(site: PlanningRowDb['site']): { name: string; details: PlanningSiteDetails | null } {
  if (!site) return { name: '', details: null };
  const s = Array.isArray(site) ? site[0] : site;
  if (!s) return { name: '', details: null };
  return {
    name: formatSiteName(s.name ?? ''),
    details: {
      adresse: s.adresse ?? null,
      metro: s.metro ?? null,
      indication: s.indication ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    },
  };
}

function mapColleagueFromUserRow(row: UserColleagueRow): PlanningColleague {
  const ui = Array.isArray(row.user_info) ? row.user_info[0] : row.user_info;
  return {
    id: row.id,
    fullname: row.fullname ?? '',
    first_name: ui?.first_name ?? '',
    last_name: ui?.last_name ?? undefined,
    telephone: ui?.telephone ?? null,
    couleur: ui?.couleur ?? null,
  };
}

function toPlanningWithColleague(
  row: PlanningRowDb,
  selectedUserId: number,
  colleagues: Map<number, PlanningColleague>,
): PlanningWithColleague {
  const isPrincipal = row.user_id === selectedUserId;
  const role: 'principal' | 'double' = isPrincipal ? 'principal' : 'double';
  const colleagueUserId = isPrincipal ? row.double_id : row.user_id;
  const colleague =
    colleagueUserId != null ? (colleagues.get(colleagueUserId) ?? null) : null;

  const { name: site_name, details: site_details } = normalizeSite(row.site);

  return {
    id: row.id,
    year: row.year,
    month: row.month,
    day: row.day,
    site_id: row.site_id,
    site_name,
    site_details,
    user_id: row.user_id ?? 0,
    double_id: row.double_id,
    user_confirmed: row.user_confirmed ?? false,
    double_confirmed: row.double_confirmed,
    role,
    colleague,
  };
}

async function fetchPlanningForUser(
  userId: number,
  year: number,
  month: number,
): Promise<PlanningWithColleague[]> {
  const supabase = createClient();
  const months = planningMonthTriplet(year, month);

  const monthResults = await Promise.all(
    months.map(async ({ year: y, month: m }) => {
      const { data, error } = await supabase
        .from('planning')
        .select(
          'id, year, month, day, site_id, user_id, double_id, user_confirmed, double_confirmed, site:site_id(name, adresse, metro, indication, latitude, longitude)',
        )
        .or(`user_id.eq.${userId},double_id.eq.${userId}`)
        .eq('year', y)
        .eq('month', m);

      if (error) {
        throw new Error(`usePlanning fetch failed: ${error.message}`);
      }
      return (data ?? []) as PlanningRowDb[];
    }),
  );

  const byId = new Map<number, PlanningRowDb>();
  for (const rows of monthResults) {
    for (const row of rows) {
      byId.set(row.id, row);
    }
  }
  const merged = [...byId.values()];

  const colleagueIds = new Set<number>();
  for (const row of merged) {
    const isPrincipal = row.user_id === userId;
    const otherId = isPrincipal ? row.double_id : row.user_id;
    if (otherId != null) colleagueIds.add(otherId);
  }

  const colleagues = new Map<number, PlanningColleague>();
  if (colleagueIds.size > 0) {
    const { data: userRows, error: usersError } = await supabase
      .from('user')
      .select('id, fullname, user_info(first_name, last_name, telephone, couleur)')
      .in('id', [...colleagueIds]);

    if (usersError) {
      throw new Error(`usePlanning colleagues fetch failed: ${usersError.message}`);
    }

    for (const u of (userRows ?? []) as UserColleagueRow[]) {
      colleagues.set(u.id, mapColleagueFromUserRow(u));
    }
  }

  return merged.map((row) => toPlanningWithColleague(row, userId, colleagues));
}

export function usePlanning(params: UsePlanningParams) {
  const selectedUserId = useProfileStore((s) => s.selectedUserId);

  return useQuery({
    queryKey: ['planning', selectedUserId, params.year, params.month],
    enabled: selectedUserId !== null,
    queryFn: async () => {
      if (selectedUserId === null) {
        return { planning: [] as PlanningWithColleague[] };
      }
      const planning = await fetchPlanningForUser(selectedUserId, params.year, params.month);
      return { planning };
    },
    staleTime: 60 * 1000,
  });
}
